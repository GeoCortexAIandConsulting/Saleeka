'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { PALETTE_HEX } from '@/lib/palette';
import type { Weekly } from '@/lib/types';
import { photo } from '@/lib/photo';

/**
 * The challenge of the week at the top of the Runway: this week's women's and men's challenges,
 * how long is left, and the most liked looks made for them so far.
 */
function left(endsAt: string): string {
  const h = Math.max(0, (Date.parse(endsAt) - Date.now()) / 3_600_000);
  if (h < 1) return 'ends within the hour';
  if (h < 24) return `${Math.floor(h)} h left`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? '' : 's'} left`;
}

export default function WeeklyBanner() {
  /** undefined while loading (its space is kept, so the looks below do not jump); null if unavailable */
  const [week, setWeek] = useState<Weekly | null | undefined>(undefined);

  useEffect(() => {
    api<Weekly>('/game/weekly')
      .then(setWeek)
      .catch(() => setWeek(null));
  }, []);

  if (week === undefined) return <div className="mt-5 h-[291px] animate-pulse rounded-3xl bg-sand/60 sm:h-[189px]" aria-hidden="true" />;
  if (!week || !week.challenges.length) return null;

  return (
    <section className="mt-5 overflow-hidden rounded-3xl border border-gold/40 bg-gradient-to-br from-plum-soft via-white to-ivory p-4 sm:p-5" aria-labelledby="weekly-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="weekly-title" className="text-lg font-semibold">
          <span aria-hidden="true">★ </span>Challenge of the week
        </h2>
        <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-plum-dark">{left(week.endsAt)}</span>
      </div>
      <p className="mt-1 text-sm text-ink/70">Style it this week: the most liked looks top the board.</p>

      <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
        {week.challenges.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-2xl border border-line bg-white p-3">
            {c.cover && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo(c.cover, 120)} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="h-16 w-12 shrink-0 rounded-xl bg-sand object-cover object-top" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/65">{c.gender === 'male' ? 'Men' : 'Women'}</p>
              <p className="truncate text-sm font-semibold">{c.title}</p>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-ink/65">
                {c.colors.slice(0, 5).map((col) => (
                  <span key={col} className="h-3 w-3 rounded-full border border-ink/15" style={{ background: PALETTE_HEX[col] }} title={col} />
                ))}
                <span className="ml-1">{c.designs ? `${c.designs} look${c.designs === 1 ? '' : 's'} this week` : 'No looks yet: be first'}</span>
              </div>
            </div>
            <Link href={`/studio?challenge=${c.id}`} className="btn btn-primary !min-h-[40px] shrink-0 !px-4 !py-2 text-sm">Style it</Link>
          </div>
        ))}
      </div>

      {week.top.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/65">Top this week</p>
          <ol className="no-scrollbar -mx-1 mt-2 flex gap-3 overflow-x-auto px-1 pb-1">
            {week.top.map((l, i) => {
              const img = l.previewUrl ?? l.items[0]?.product.images?.[0];
              return (
                <li key={l.id} className="shrink-0">
                  <Link href={`/runway/${l.id}`} className="group block w-24" aria-label={`Number ${i + 1}: ${l.by}’s look, ${l.up} likes`}>
                    <div className="relative">
                      {img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={photo(img, 240)} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="aspect-[3/4] w-24 rounded-xl bg-sand object-cover object-top transition group-hover:opacity-90" />
                      ) : (
                        <div className="aspect-[3/4] w-24 rounded-xl bg-sand" />
                      )}
                      <span className={`absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${i === 0 ? 'bg-gold text-ink' : 'bg-white/90 text-ink'}`}>{i + 1}</span>
                    </div>
                    <p className="mt-1 truncate text-xs font-semibold">{l.by}</p>
                    <p className="text-xs text-plum">♥ {l.up}</p>
                  </Link>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}
