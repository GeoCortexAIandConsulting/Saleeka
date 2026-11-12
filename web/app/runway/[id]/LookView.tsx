'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import LookBoard from '@/components/LookBoard';
import LookComments, { ago } from '@/components/LookComments';
import { AiBadge, Heart, HeartBurst, LikeButton, piecesOf, statesOf } from '@/components/LookParts';
import ShareButtons from '@/components/ShareButtons';
import { api, rupees } from '@/lib/api';
import { SLOT_NAME } from '@/lib/lookRules';
import { useMaybeUser } from '@/lib/useMe';
import { castVote } from '@/lib/vote';
import type { FeedLook } from '@/lib/types';

/**
 * A look's own page: the look on a model (or its pieces board), every piece to shop with its photo
 * and price, likes, sharing, and the comments. Shared links open it for anyone: visitors see it all,
 * and joining is one tap away when they want to like or comment.
 */
export default function LookView({ id }: { id: string }) {
  const { me, ready } = useMaybeUser();
  const [look, setLook] = useState<FeedLook | null>(null);
  const [error, setError] = useState('');
  const [showPieces, setShowPieces] = useState(false);
  const [burst, setBurst] = useState(0);
  /** Double-tap the image to like it (only ever likes; the button below takes a like back). */
  const likeByTap = () => {
    if (!me || !look) return;
    setBurst((b) => b + 1);
    if (look.myVote !== 'up') castVote(look, 'up', setLook);
  };

  useEffect(() => {
    if (!ready || !id) return;
    api<{ look: FeedLook }>(`/feed/${id}`)
      .then((r) => setLook(r.look))
      .catch((e) => setError(e.message));
  }, [ready, me, id]);

  /** Visitors join first, then come straight back to this look. */
  const join = `/signup?next=${encodeURIComponent(`/runway/${id}`)}`;

  // Opened from a tile's comment count: go to the comments once the look is on screen.
  useEffect(() => {
    if (look && window.location.hash === '#comments') document.getElementById('comments')?.scrollIntoView({ behavior: 'smooth' });
  }, [look]);

  if (!ready) return <Header signedIn={false} />;

  return (
    <>
      <Header signedIn={Boolean(me)} />
      <main className="page py-6 sm:py-8">
        {me ? (
          <Link href="/runway" className="text-sm text-plum underline-offset-2 hover:underline">← Runway</Link>
        ) : (
          <p className="rounded-2xl bg-plum-soft px-4 py-3 text-sm text-plum-dark">
            A look styled on <span className="font-semibold">Saleeqa</span>, the styling game for Pakistani fashion.{' '}
            <Link href={join} className="font-semibold underline">Style your own, free</Link>
          </p>
        )}

        {error ? (
          <div className="card mt-6 py-10 text-center">
            <h1 className="font-semibold">{error}</h1>
            <Link href="/runway" className="btn btn-primary mt-4">Back to the Runway</Link>
          </div>
        ) : !look ? (
          <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)]" aria-label="Loading the look">
            <div className="mx-auto aspect-[3/4] w-full max-w-[560px] animate-pulse rounded-3xl bg-sand" />
            <div className="space-y-3">
              <div className="h-6 w-2/3 animate-pulse rounded bg-sand" />
              <div className="h-4 w-1/3 animate-pulse rounded bg-sand" />
              {Array.from({ length: 4 }, (_, k) => (
                <div key={k} className="h-20 animate-pulse rounded-2xl bg-sand" />
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-6 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
            {/* ------------------------------ the look ------------------------------ */}
            <div className="lg:sticky lg:top-24">
              <div className="mx-auto w-full max-w-[560px]">
                {look.previewUrl && !showPieces ? (
                  <div className="relative select-none" onDoubleClick={likeByTap} title={me ? 'Double-tap to like' : undefined}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={look.previewUrl} alt={`${look.by}’s look on a model (AI preview)`} className="aspect-[3/4] w-full rounded-3xl bg-sand object-cover" draggable={false} />
                    <AiBadge />
                    {burst > 0 && <HeartBurst key={burst} />}
                  </div>
                ) : (
                  <LookBoard pieces={piecesOf(look)} states={statesOf(look)} gender={look.challenge?.gender} className="w-full" />
                )}
                {look.previewUrl && (
                  <div className="mt-3 flex justify-center gap-1 text-sm" role="tablist" aria-label="How to show this look">
                    {([false, true] as const).map((pieces) => (
                      <button
                        key={String(pieces)}
                        type="button"
                        role="tab"
                        aria-selected={showPieces === pieces}
                        onClick={() => setShowPieces(pieces)}
                        className={`rounded-full px-4 py-1.5 ${showPieces === pieces ? 'bg-plum text-white' : 'text-ink/65 hover:bg-sand'}`}
                      >
                        {pieces ? 'The pieces' : 'On model'}
                      </button>
                    ))}
                  </div>
                )}
                {look.previewUrl && !showPieces && <p className="mt-2 text-center text-xs text-ink/65">An AI image: small details may differ from the real pieces.</p>}
              </div>
            </div>

            {/* ------------------------------ about it ------------------------------ */}
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-plum-soft font-semibold text-plum-dark" aria-hidden="true">
                  {look.by.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="font-semibold">
                    {me ? (
                      <Link href={`/u/${look.byId}`} className="hover:text-plum hover:underline">{look.by}</Link>
                    ) : (
                      look.by
                    )}
                    {look.mine && <span className="ml-1.5 rounded-full bg-sand px-2 py-0.5 text-[11px] font-semibold text-ink/65">You</span>}
                  </p>
                  <p className="text-xs text-ink/65">Styled {ago(look.createdAt)}</p>
                </div>
              </div>
              <h1 className="mt-4 text-2xl font-semibold sm:text-3xl">{look.challenge?.title ?? 'A look'}</h1>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {me ? (
                  <LikeButton big look={look} onVote={() => castVote(look, 'up', setLook)} />
                ) : (
                  <Link href={join} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-line bg-white px-3 text-base font-semibold text-ink/75 hover:border-gold">
                    <Heart on={false} className="h-6 w-6" />
                    <span className="sr-only">Join to like, </span>
                    {look.up}
                    <span className="sr-only"> {look.up === 1 ? 'like' : 'likes'}</span>
                  </Link>
                )}
                {me && (
                  <button
                    type="button"
                    onClick={() => castVote(look, 'down', setLook)}
                    aria-pressed={look.myVote === 'down'}
                    className={`min-h-[44px] rounded-full border px-4 text-sm transition ${look.myVote === 'down' ? 'border-ink/30 bg-sand font-semibold text-ink' : 'border-line bg-white text-ink/65 hover:border-gold'}`}
                    title="Only you see this; it helps us learn your taste"
                  >
                    {look.myVote === 'down' ? 'Not my style ✓' : 'Not my style'}
                  </button>
                )}
              </div>

              {me && (
                <Link
                  href={`/studio?remix=${look.id}`}
                  className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-full border border-plum/30 bg-plum-soft px-4 text-sm font-semibold text-plum-dark hover:border-plum"
                >
                  <span aria-hidden="true">✂</span> {look.mine ? 'Make a new version' : 'Remix this look'}
                </Link>
              )}

              <div className="mt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/65">{look.mine ? 'Share your look' : 'Share this look'}</p>
                <ShareButtons
                  lookId={look.id}
                  compact
                  text={look.mine ? `I styled this ${look.challenge?.title ?? 'look'} on Saleeqa. What do you think?` : `Look at this ${look.challenge?.title ?? 'look'} on Saleeqa!`}
                />
              </div>

              {/* --------------------------- shop the look --------------------------- */}
              <section className="mt-7" aria-labelledby="shop">
                <div className="flex items-baseline justify-between">
                  <h2 id="shop" className="text-lg font-semibold">Shop the look</h2>
                  <span className="text-sm text-ink/70">
                    Total <span className="font-semibold text-ink">{rupees(look.total)}</span>
                  </span>
                </div>
                <ul className="mt-3 space-y-2.5">
                  {look.items.map(({ slot, product: p }) => (
                    <li key={slot} className="flex items-center gap-3 rounded-2xl border border-line bg-white p-2.5">
                      {p.images?.[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.images[0]} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-20 w-16 shrink-0 rounded-xl object-cover object-top" style={{ background: p.hex }} />
                      ) : (
                        <span className="h-20 w-16 shrink-0 rounded-xl" style={{ background: p.hex }} />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/65">{SLOT_NAME[slot]}</p>
                        <p className="line-clamp-2 text-sm font-medium capitalize">{p.title}</p>
                        <p className="mt-0.5 text-xs text-ink/65">
                          {p.brandName} · <span className="whitespace-nowrap font-semibold text-ink">{rupees(p.price)}</span>
                        </p>
                      </div>
                      <a
                        href={`/api/go/${p.id}?look=${look.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-ghost !min-h-[40px] shrink-0 !px-3.5 !py-2 text-sm"
                        aria-label={`Shop ${p.title} at ${p.brandName} (opens the brand's site)`}
                      >
                        Shop ↗
                      </a>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-ink/65">Prices and stock are from each brand’s site and may have changed.</p>
              </section>

              {/* ------------------------------ comments ------------------------------ */}
              <section id="comments" className="mt-8 scroll-mt-24" aria-labelledby="comments-title">
                <h2 id="comments-title" className="text-lg font-semibold">
                  Comments <span className="text-sm font-normal text-ink/65">({look.comments})</span>
                </h2>
                <LookComments look={look} joinHref={me ? undefined : join} onCount={(n) => setLook((l) => (l ? { ...l, comments: n } : l))} />
              </section>

              <div className="mt-8 rounded-3xl bg-plum-soft p-5 text-center">
                <p className="font-semibold text-plum-dark">Have an idea for this challenge?</p>
                <Link href={me ? '/studio' : join} className="btn btn-primary mt-3">{me ? 'Style your own look' : 'Join free and style your own'}</Link>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
