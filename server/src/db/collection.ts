/**
 * A deliberately tiny collection interface. The production implementation is a thin
 * pass-through to the official MongoDB driver (see mongo.ts). The in-memory
 * implementation below is used for local demos and tests, and supports the same
 * operations with simple equality filters (plus `$in`).
 */
export type Doc = { id: string } & Record<string, any>;

export type Filter<T> = {
  [K in keyof T]?: T[K] | { $in: T[K][] };
};

export interface Collection<T extends Doc> {
  insert(doc: T): Promise<T>;
  findOne(filter: Filter<T>): Promise<T | null>;
  find(filter?: Filter<T>): Promise<T[]>;
  /** Shallow-merge `patch` into the first matching document. */
  update(filter: Filter<T>, patch: Partial<T>): Promise<T | null>;
  /** Replace or insert by id. */
  upsert(doc: T): Promise<T>;
  delete(filter: Filter<T>): Promise<number>;
  count(filter?: Filter<T>): Promise<number>;
}

function matches<T extends Doc>(doc: T, filter: Filter<T>): boolean {
  return Object.entries(filter).every(([key, cond]) => {
    const value = (doc as any)[key];
    if (cond && typeof cond === 'object' && '$in' in (cond as any)) {
      return ((cond as any).$in as unknown[]).includes(value);
    }
    return value === cond;
  });
}

export class MemoryCollection<T extends Doc> implements Collection<T> {
  private docs = new Map<string, T>();

  async insert(doc: T) {
    if (this.docs.has(doc.id)) throw new Error(`Duplicate id ${doc.id}`);
    this.docs.set(doc.id, structuredClone(doc));
    return doc;
  }
  async findOne(filter: Filter<T>) {
    for (const d of this.docs.values()) if (matches(d, filter)) return structuredClone(d);
    return null;
  }
  async find(filter: Filter<T> = {}) {
    return [...this.docs.values()].filter((d) => matches(d, filter)).map((d) => structuredClone(d));
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
