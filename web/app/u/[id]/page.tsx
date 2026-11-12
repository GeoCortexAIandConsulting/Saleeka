'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import LookTile from '@/components/LookTile';
import { api } from '@/lib/api';
import { useRequireUser } from '@/lib/useMe';
import type { FeedLook, PlayerProfile } from '@/lib/types';

/**
 * A player's page: first name, when they joined, how many looks and likes, and every look they
 * published. `/u/me` is your own page.
 */
export default function PlayerPage() {
  const me = useRequireUser();
  const { id } = useParams<{ id: string }>();
  const [player, setPlayer] = useState<PlayerProfile | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!me || !id) return;
    const who = id === 'me' ? me.user.id : id;
    setPlayer(null);
    api<PlayerProfile>(`/players/${who}`)
      .then(setPlayer)
      .catch((e) => setError(e.message));
  }, [me, id]);

  const update = (l: FeedLook) => setPlayer((p) => (p ? { ...p, looks: p.looks.map((x) => (x.id === l.id ? l : x)) } : p));

  if (!me) return <Header />;

  return (
    <>
      <Header />
      <main className="page py-6 sm:py-8">
        {error ? (
          <div className="card py-10 text-center">
            <h1 className="font-semibold">{error}</h1>
            <Link href="/runway" className="btn btn-primary mt-4">Back to the Runway</Link>
          </div>
        ) : !player ? (
          <div className="flex items-center gap-4" aria-label="Loading">
            <div className="h-20 w-20 animate-pulse rounded-full bg-sand" />
            <div className="space-y-2">
              <div className="h-6 w-40 animate-pulse rounded bg-sand" />
              <div className="h-4 w-28 animate-pulse rounded bg-sand" />
            </div>
          </div>
        ) : (
          <>
            <section className="flex flex-wrap items-center gap-5">
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-plum-soft font-display text-3xl font-semibold text-plum-dark" aria-hidden="true">
                {player.name.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="eyebrow">{player.me ? 'Your page' : 'Stylist'}</p>
                <h1 className="text-3xl font-semibold">{player.name}</h1>
                <p className="mt-1 text-sm text-ink/65">
                  Styling on Saleeqa since {new Date(player.joined).toLocaleDateString('en-PK', { month: 'long', year: 'numeric' })}
                </p>
              </div>
              <dl className="grid w-full grid-cols-2 gap-3 sm:flex sm:w-auto">
                <div className="min-w-[88px] rounded-2xl border border-line bg-white px-4 py-3 text-center">
                  <dt className="text-xs text-ink/65">Looks</dt>
                  <dd className="text-2xl font-semibold">{player.stats.looks}</dd>
                </div>
                <div className="min-w-[88px] rounded-2xl border border-line bg-white px-4 py-3 text-center">
                  <dt className="text-xs text-ink/65">Likes</dt>
                  <dd className="text-2xl font-semibold text-plum">♥ {player.stats.likes}</dd>
                </div>
              </dl>
            </section>

            {player.looks.length === 0 ? (
              <div className="card mt-8 py-10 text-center">
                <h2 className="font-semibold">{player.me ? 'You haven’t published a look yet' : `${player.name} hasn’t published a look yet`}</h2>
                {player.me && <Link href="/studio" className="btn btn-primary mt-4">Style your first look</Link>}
              </div>
            ) : (
              <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {player.looks.map((l) => (
                  <LookTile key={l.id} look={l} onChange={update} />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
