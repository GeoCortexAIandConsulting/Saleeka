import { describe, expect, it } from 'vitest';
import { createMemoryRepos } from '../src/db/index.js';
import { MIN_ASKS, listChallenges, recordSearchChallenge } from '../src/services/game.js';
import { profileFor } from './fixtures.js';

describe('challenges from shoppers’ searches', () => {
  it('counts every search, even when many arrive at the same moment', async () => {
    const repos = createMemoryRepos();
    const profile = profileFor();
    const ask = { occasion: 'party' as const, colors: ['black'] } as Parameters<typeof recordSearchChallenge>[2];
    await Promise.all(Array.from({ length: 6 }, () => recordSearchChallenge(repos, profile, ask)));
    const made = await repos.challenges.find({ source: 'search' });
    expect(made).toHaveLength(1);
    expect(made[0].asks).toBe(6);
    // Asked often enough, it becomes a public challenge.
    expect(6).toBeGreaterThanOrEqual(MIN_ASKS);
    expect((await listChallenges(repos)).some((c) => c.id === made[0].id && c.fromShoppers)).toBe(true);
  });
});
