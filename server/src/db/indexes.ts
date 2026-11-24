/**
 * Every MongoDB index the app needs, in one list (createMongoRepos creates them at start-up;
 * creating an index that already exists does nothing). Each one serves a busy lookup, noted beside it.
 * test/indexes.test.ts checks the busy lookups are covered.
 */
export type IndexSpec = { collection: string; keys: Record<string, 1 | -1>; options?: { unique?: boolean; sparse?: boolean; partialFilterExpression?: Record<string, unknown> } };

export const INDEXES: IndexSpec[] = [
  // Users: sign-in and sign-up by email; usernames are unique (older accounts without one are left out).
  { collection: 'users', keys: { email: 1 }, options: { unique: true } },
  { collection: 'users', keys: { username: 1 }, options: { unique: true, partialFilterExpression: { username: { $type: 'string' } } } },
  // Opening a "confirm your email" or "reset password" link finds the account by the link's hash.
  { collection: 'users', keys: { verifyTokenHash: 1 }, options: { sparse: true } },
  { collection: 'users', keys: { resetTokenHash: 1 }, options: { sparse: true } },

  // Catalogue: the in-memory copy loads in-stock pieces; admin counts in-stock pieces per brand.
  { collection: 'products', keys: { inStock: 1 } },
  { collection: 'products', keys: { slot: 1, inStock: 1 } },
  { collection: 'products', keys: { brandId: 1, inStock: 1 } },
  { collection: 'challenges', keys: { key: 1 }, options: { unique: true } },

  // Looks (designs): by challenge and date (challenge lists, weekly and launch boards), the Runway's
  // newest-first pages, a player's own looks newest first (profiles), drafts, and a preview's looks.
  { collection: 'designs', keys: { challengeId: 1, status: 1, createdAt: -1 } },
  { collection: 'designs', keys: { status: 1, createdAt: -1 } },
  { collection: 'designs', keys: { userId: 1, createdAt: -1 } },
  { collection: 'designs', keys: { previewId: 1 } },
  { collection: 'designVotes', keys: { designId: 1 } },
  { collection: 'designVotes', keys: { userId: 1 } },
  { collection: 'comments', keys: { designId: 1, at: -1 } },
  { collection: 'comments', keys: { parentId: 1 }, options: { sparse: true } },
  { collection: 'comments', keys: { userId: 1 } },
  { collection: 'looks', keys: { userId: 1, saved: 1 } },

  // Events: brand reports (brand, type, date); preview limits (a player's previews, and everyone's today).
  { collection: 'events', keys: { brandId: 1, type: 1, at: -1 } },
  { collection: 'events', keys: { userId: 1, type: 1, at: -1 } },
  { collection: 'events', keys: { type: 1, at: -1 } },

  // AI previews: one image per player and pieces (by key), a player's images.
  { collection: 'previews', keys: { key: 1 } },
  { collection: 'previews', keys: { userId: 1, at: -1 } },

  // The bell, and moderation.
  { collection: 'notifications', keys: { userId: 1, at: -1 } },
  { collection: 'notifications', keys: { actorId: 1 } },
  { collection: 'reports', keys: { status: 1, at: -1 } },
  { collection: 'reports', keys: { target: 1, targetId: 1, status: 1 } },
  { collection: 'reports', keys: { reporterId: 1 } },
];

/** Does some index start with exactly these fields, in this order (so MongoDB can use it for this lookup)? */
export function covered(collection: string, fields: string[], list: IndexSpec[] = INDEXES): boolean {
  return list.some((ix) => ix.collection === collection && fields.every((f, i) => Object.keys(ix.keys)[i] === f));
}
