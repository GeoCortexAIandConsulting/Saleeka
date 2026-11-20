'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import GuestWall from '@/components/GuestWall';
import Header from '@/components/Header';
import LookTile from '@/components/LookTile';
import { toast } from '@/components/Toaster';
import WeeklyBanner from '@/components/WeeklyBanner';
import { api } from '@/lib/api';
import { useMaybeUser } from '@/lib/useMe';
import { useLiveCounts, withCounts } from '@/lib/useLiveCounts';
import type { FeedLook, Gender } from '@/lib/types';

/**
 * Runway: the public feed of every look published from the Studio. Each tile opens the look's own
 * page (big image, the pieces to shop, comments). Likes are public; dislikes are never shown.
 */

const OCCASIONS: Array<[string, string]> = [
  ['', 'All occasions'],
  ['eid', 'Eid'],
  ['mehndi', 'Mehndi'],
  ['baraat', 'Baraat'],
  ['walima', 'Walima'],
  ['party', 'Party'],
  ['office', 'Office'],
  ['university', 'University'],
  ['casual', 'Everyday'],
];

export default function Runway() {
  // Visitors without an account see the first few looks, then an invitation to sign in.
  const { me, ready } = useMaybeUser();
  const [looks, setLooks] = useState<FeedLook[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  /** Everyone's looks, or only women's or men's */
  const [show, setShow] = useState<Gender | 'all'>('all');
  /** Trending first: fresh looks people love; New: latest; Top: most liked this week */
  const [sort, setSort] = useState<'trending' | 'new' | 'top'>('trending');
  /** One occasion's looks, or all */
  const [occasion, setOccasion] = useState('');
  const q = `sort=${sort}${show === 'all' ? '' : `&gender=${show}`}${occasion ? `&occasion=${occasion}` : ''}`;
  /** Asked again after "Try again" */
  const [attempt, setAttempt] = useState(0);

  // Errors show as a pop-up, wherever the page is scrolled.
  useEffect(() => {
    if (error) toast(error, 'error');
  }, [error]);

  /** The "rank a few looks" note can be put away for good on this device. */
  const rankKey = me ? `saleeqa:hide-rank:${me.user.id}` : null;
  const [rankHidden, setRankHidden] = useState(true);
  useEffect(() => {
    if (!rankKey) return;
    try {
      setRankHidden(localStorage.getItem(rankKey) === '1');
    } catch {
      setRankHidden(false);
    }
  }, [rankKey]);
  const hideRank = () => {
    setRankHidden(true);
    try {
      if (rankKey) localStorage.setItem(rankKey, '1');
    } catch {
      /* storage blocked: hidden for this visit */
    }
  };

  useEffect(() => {
    if (!ready) return;
    let live = true; // a quick switch between tabs must not show the older answer
    setLooks(null);
    setError('');
    api<{ looks: FeedLook[]; next: string | null }>(`/feed?${q}`)
      .then((r) => {
        if (!live) return;
        setLooks(r.looks);
        setNext(r.next);
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [ready, me, q, attempt]);

  async function more() {
    if (!next) return;
    setLoadingMore(true);
    try {
      const r = await api<{ looks: FeedLook[]; next: string | null }>(`/feed?before=${encodeURIComponent(next)}&${q}`);
      setLooks((l) => [...(l ?? []), ...r.looks]);
      setNext(r.next);
    } catch (e) {
      setError((e as Error).message);
    }
    setLoadingMore(false);
  }

  const update = (l: FeedLook) => setLooks((ls) => ls?.map((x) => (x.id === l.id ? l : x)) ?? ls);
  // Likes and comments update live while the Runway is open.
  useLiveCounts(looks?.map((l) => l.id) ?? [], (counts) => setLooks((ls) => ls?.map((l) => withCounts(l, counts)) ?? ls));

  if (!ready) return <Header signedIn={false} />;

  return (
    <>
      <Header signedIn={Boolean(me)} />
      <main className="page py-6 sm:py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Runway</p>
            <h1 className="mt-1 text-3xl font-semibold sm:text-4xl">Looks from the community</h1>
            <p className="mt-1 max-w-xl text-sm text-ink/70">Every look here was styled by a Saleeqa player from real pieces. Like what you love, and tell them why.</p>
          </div>
          <Link href="/studio" className="btn btn-primary">Style a look</Link>
        </div>

        {me && <WeeklyBanner />}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 rounded-full border border-line bg-white p-1 text-sm" role="tablist" aria-label="Order of looks">
            {(
              [
                ['trending', '🔥 Trending'],
                ['new', 'New'],
                ['top', 'Top this week'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={sort === id}
                onClick={() => setSort(id)}
                className={`min-h-[40px] whitespace-nowrap rounded-full px-3.5 ${sort === id ? 'bg-plum font-semibold text-white' : 'text-ink/70 hover:bg-sand'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex gap-2" role="tablist" aria-label="Whose looks">
            {(['all', 'female', 'male'] as const).map((g) => (
              <button key={g} type="button" role="tab" aria-selected={show === g} onClick={() => setShow(g)} className={`chip ${show === g ? 'chip-on' : ''}`}>
                {g === 'all' ? 'All' : g === 'female' ? 'Women' : 'Men'}
              </button>
            ))}
          </div>
        </div>

        <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="tablist" aria-label="Occasion">
          {OCCASIONS.map(([id, label]) => (
            <button
              key={id || 'all'}
              type="button"
              role="tab"
              aria-selected={occasion === id}
              onClick={() => setOccasion(id)}
              className={`min-h-[40px] shrink-0 rounded-full border px-4 text-sm transition-colors ${occasion === id ? 'border-plum bg-plum font-semibold text-white' : 'border-line bg-white text-ink/75 hover:border-gold'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* The ranking rounds teach the women's stylist, so they are offered to women. */}
        {me && me.gender !== 'male' && me.roundsDone < me.maxRounds && !rankHidden && (
          <div className="mt-4 flex items-center gap-3 rounded-2xl bg-plum-soft py-1.5 pl-4 pr-1.5 text-sm text-plum-dark">
            <p className="flex-1">
              Help us learn your taste: <Link href="/rounds" className="font-semibold underline">rank a few looks</Link>.
            </p>
            <button type="button" onClick={hideRank} aria-label="Hide this note" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl leading-none hover:bg-white/70">
              ×
            </button>
          </div>
        )}

        {!looks && error ? (
          <div className="card mt-6 py-10 text-center">
            <h2 className="font-semibold">The looks didn’t load</h2>
            <p className="mt-1 text-sm text-ink/70">Check your connection and try again.</p>
            <button type="button" className="btn btn-primary mt-4" onClick={() => setAttempt((a) => a + 1)}>Try again</button>
          </div>
        ) : !looks ? (
          <ul className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-label="Loading looks">
            {Array.from({ length: 4 }, (_, k) => (
              <li key={k} className="overflow-hidden rounded-3xl border border-line bg-white">
                <div className="aspect-[4/5] w-full animate-pulse bg-sand" />
                <div className="space-y-2 p-3.5">
                  <div className="h-3 w-2/3 animate-pulse rounded bg-sand" />
                  <div className="h-3 w-1/3 animate-pulse rounded bg-sand" />
                </div>
              </li>
            ))}
          </ul>
        ) : looks.length === 0 ? (
          <div className="card mt-6 py-10 text-center">
            <h2 className="font-semibold">{sort === 'top' ? 'No looks this week yet' : 'No looks yet'}{occasion ? ` for ${OCCASIONS.find(([id]) => id === occasion)?.[1]}` : ''}</h2>
            <p className="mt-1 text-sm text-ink/70">Be the first to style one.</p>
            <Link href="/studio" className="btn btn-primary mt-4">Style a look</Link>
          </div>
        ) : (
          <>
            <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {looks.map((l) => (
                <LookTile key={l.id} look={l} onChange={update} />
              ))}
            </div>
            {!me && <GuestWall next="/runway" />}
            {next && (
              <div className="mt-6 text-center">
                <button className="btn btn-ghost" disabled={loadingMore} onClick={more}>{loadingMore ? 'Loading…' : 'Show more looks'}</button>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
