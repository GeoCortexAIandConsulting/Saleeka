import { MemoryCollection, type Collection } from './collection.js';
import { MongoCollection, connectMongo } from './mongo.js';
import type {
  Brand,
  ChatSession,
  EventRecord,
  Look,
  Product,
  Profile,
  RoundRecord,
  User,
} from '../types.js';

export type ProfileDoc = Profile & { id: string }; // id = userId

export interface Repos {
  users: Collection<User>;
  profiles: Collection<ProfileDoc>;
  brands: Collection<Brand>;
  products: Collection<Product>;
  looks: Collection<Look>;
  rounds: Collection<RoundRecord>;
  sessions: Collection<ChatSession>;
  events: Collection<EventRecord>;
  close(): Promise<void>;
}

export function createMemoryRepos(): Repos {
  return {
    users: new MemoryCollection<User>(),
    profiles: new MemoryCollection<ProfileDoc>(),
    brands: new MemoryCollection<Brand>(),
    products: new MemoryCollection<Product>(),
    looks: new MemoryCollection<Look>(),
    rounds: new MemoryCollection<RoundRecord>(),
    sessions: new MemoryCollection<ChatSession>(),
    events: new MemoryCollection<EventRecord>(),
    close: async () => {},
  };
}

export async function createMongoRepos(uri: string, dbName: string): Promise<Repos> {
  const { client, db } = await connectMongo(uri, dbName);
  const repos: Repos = {
    users: new MongoCollection<User>(db, 'users'),
    profiles: new MongoCollection<ProfileDoc>(db, 'profiles'),
    brands: new MongoCollection<Brand>(db, 'brands'),
    products: new MongoCollection<Product>(db, 'products'),
    looks: new MongoCollection<Look>(db, 'looks'),
    rounds: new MongoCollection<RoundRecord>(db, 'rounds'),
    sessions: new MongoCollection<ChatSession>(db, 'sessions'),
    events: new MongoCollection<EventRecord>(db, 'events'),
    close: () => client.close(),
  };
  // Indexes that matter from day one.
  await db.collection('users').createIndex({ email: 1 }, { unique: true });
  await db.collection('products').createIndex({ slot: 1, inStock: 1 });
  await db.collection('looks').createIndex({ userId: 1, saved: 1 });
  await db.collection('events').createIndex({ brandId: 1, type: 1, at: -1 });
  return repos;
}
