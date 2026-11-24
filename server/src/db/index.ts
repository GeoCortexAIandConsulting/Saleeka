import { MemoryCollection, type Collection } from './collection.js';
import { INDEXES } from './indexes.js';
import { MongoCollection, connectMongo } from './mongo.js';
import type {
  Brand,
  Challenge,
  ChatSession,
  Design,
  DesignVote,
  DesignComment,
  PreviewImage,
  PreviewUsage,
  AppNotification,
  Report,
  CatalogMeta,
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
  challenges: Collection<Challenge>;
  designs: Collection<Design>;
  designVotes: Collection<DesignVote>;
  comments: Collection<DesignComment>;
  previews: Collection<PreviewImage>;
  previewUsage: Collection<PreviewUsage>;
  notifications: Collection<AppNotification>;
  reports: Collection<Report>;
  /** Catalog sync status (one document, id 'catalog') */
  meta: Collection<CatalogMeta>;
  close(): Promise<void>;
  /** Resolves when the database answers (the health check gives it 2 seconds) */
  ping(): Promise<void>;
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
    challenges: new MemoryCollection<Challenge>(),
    designs: new MemoryCollection<Design>(),
    designVotes: new MemoryCollection<DesignVote>(),
    comments: new MemoryCollection<DesignComment>(),
    previews: new MemoryCollection<PreviewImage>(),
    previewUsage: new MemoryCollection<PreviewUsage>(),
    notifications: new MemoryCollection<AppNotification>(),
    reports: new MemoryCollection<Report>(),
    meta: new MemoryCollection<CatalogMeta>(),
    close: async () => {},
    ping: async () => {},
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
    challenges: new MongoCollection<Challenge>(db, 'challenges'),
    designs: new MongoCollection<Design>(db, 'designs'),
    designVotes: new MongoCollection<DesignVote>(db, 'designVotes'),
    comments: new MongoCollection<DesignComment>(db, 'comments'),
    previews: new MongoCollection<PreviewImage>(db, 'previews'),
    previewUsage: new MongoCollection<PreviewUsage>(db, 'previewUsage'),
    notifications: new MongoCollection<AppNotification>(db, 'notifications'),
    reports: new MongoCollection<Report>(db, 'reports'),
    meta: new MongoCollection<CatalogMeta>(db, 'meta'),
    close: () => client.close(),
    ping: async () => void (await db.command({ ping: 1 })),
  };
  // Every index the busy lookups need (db/indexes.ts); creating one that exists already does nothing.
  for (const ix of INDEXES) await db.collection(ix.collection).createIndex(ix.keys, ix.options ?? {});
  return repos;
}
