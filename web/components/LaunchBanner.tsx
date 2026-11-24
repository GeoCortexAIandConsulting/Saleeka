'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { deadlineLabel, LAUNCH_ENDS, timeLeft } from '@/lib/launch';
import type { LaunchBoard } from '@/lib/types';
import { photo } from '@/lib/photo';

/** Shown at once, before the board loads (the same as the server sends), so nothing moves when it arrives. */
const PRIZE = 'Top-voted look wins a PKR 10,000 voucher';
const NAMES = ['Mehndi', 'Baraat', 'Walima', 'Winter wedding', 'Nikkah'];
const FIRST = 'seed-launch-mehndi-20k';

/**
 * The launch contest: its challenges, the prize, a countdown to the deadline (NEXT_PUBLIC_LAUNCH_ENDS,
 * Pakistan time) and a Play button. With `board`, also the top 10 launch looks so far. It hides itself
 * after the deadline. Every line is one line high and the countdown boxes have a fixed size, so the
 * banner is the same height before and after it loads (no jump).
 */
export default function LaunchBanner({ board = false, onPlay }: { board?: boolean; onPlay?: (challengeId: string) => void }) {
  const [data, setData] = useState<LaunchBoard | null>(null);
  const [now, setNow] = useState<number | null>(null); // null until mounted: the countdown shows "--"

  useEffect(() => {
    api<LaunchBoard>('/game/launch')
      .then(setData)
      .catch(() => setData({ active: false }));
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const live = data?.active ? data : null;
  const ends = LAUNCH_ENDS ?? (live ? Date.parse(live.endsAt) : null);
  // Gone after the deadline, or when the server says the launch is over.
  if (data && !data.active) return null;
  if (ends !== null && (now ?? Date.now()) >= ends) return null;

  const left = ends !== null && now !== null ? timeLeft(ends, now) : null;
  const names = live?.challenges.map((c) => c.name ?? c.title) ?? NAMES;
  const first = live?.challenges[0]?.id ?? FIRST;
  const box = (n: number | undefined, label: string) => (
    <span className="flex h-12 w-11 flex-col items-center justify-center rounded-xl bg-white/90 leading-none" aria-hidden="true">
      <span className="text-lg font-bold tabular-nums text-plum-dark">{n === undefined ? '--' : String(n).padStart(2, '0')}</span>
      <span className="mt-0.5 text-[10px] font-semibold uppercase text-ink/70">{label}</span>
    </span>
  );

  return (
    <section className="mt-5 overflow-hidden rounded-3xl border border-gold/50 bg-gradient-to-br from-plum-soft via-white to-ivory p-4 sm:p-5" aria-labelledby="launch-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p id="launch-title" className="eyebrow truncate">
            <span aria-hidden="true">🏆 </span>Launch challenges
          </p>
          <p className="mt-1 truncate text-base font-semibold text-ink">{live?.prize ?? PRIZE}</p>
          <p className="mt-0.5 truncate text-sm text-ink/70">{names.join(' · ')}</p>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div role="timer" aria-label={ends !== null ? `Ends ${deadlineLabel(ends)}, Pakistan time` : 'Countdown to the deadline'} className="flex gap-1.5">
            {box(left?.days, 'days')}
            {box(left?.hours, 'hrs')}
            {box(left?.minutes, 'min')}
            {box(left?.seconds, 'sec')}
          </div>
          {onPlay ? (
            <button type="button" onClick={() => onPlay(first)} className="btn btn-primary !min-h-[44px] shrink-0 !px-5">
              Play
            </button>
          ) : (
            <Link href={`/studio?challenge=${first}`} className="btn btn-primary !min-h-[44px] shrink-0 !px-5">
              Play
            </Link>
          )}
        </div>
      </div>

      {board && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/70">Leaderboard · top 10</p>
          {/* A fixed-height row, whether it holds no looks or ten. */}
          <ol className="no-scrollbar -mx-1 mt-2 flex h-[172px] gap-3 overflow-x-auto px-1 pb-1" aria-label="Most liked launch looks">
            {!live ? (
              Array.from({ length: 4 }, (_, i) => <li key={i} className="h-32 w-24 shrink-0 animate-pulse rounded-xl bg-sand/70" aria-hidden="true" />)
            ) : !live.top.length ? (
              <li className="flex h-32 w-full items-center justify-center rounded-xl border border-dashed border-gold/60 bg-white/70 px-4 text-center text-sm text-ink/75">
                No looks yet. Publish yours and be number 1!
              </li>
            ) : (
              live.top.map((l, i) => {
                const img = l.previewUrl ?? l.items[0]?.product.images?.[0];
                return (
                  <li key={l.id} className="shrink-0">
                    <Link href={`/runway/${l.id}`} className="group block w-24" aria-label={`Number ${i + 1}: ${l.by}’s ${l.challenge?.name ?? 'look'}, ${l.up} like${l.up === 1 ? '' : 's'}`}>
                      <div className="relative">
                        {img ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={photo(img, 240)} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="h-32 w-24 rounded-xl bg-sand object-cover object-top transition group-hover:opacity-90" />
                        ) : (
                          <div className="h-32 w-24 rounded-xl bg-sand" />
                        )}
                        <span className={`absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${i === 0 ? 'bg-gold text-ink' : 'bg-white/90 text-ink'}`}>{i + 1}</span>
                      </div>
                      <p className="mt-1 truncate text-xs font-semibold">{l.by}</p>
                      <p className="truncate text-xs text-plum-dark">
                        ♥ {l.up} · {l.challenge?.name ?? ''}
                      </p>
                    </Link>
                  </li>
                );
              })
            )}
          </ol>
        </div>
      )}
    </section>
  );
}
