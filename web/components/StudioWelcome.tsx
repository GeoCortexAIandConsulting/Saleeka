'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { FeedLook } from '@/lib/types';
import { photo } from '@/lib/photo';

/**
 * What the Studio shows before a challenge is picked: how it works in three steps, and a few
 * trending looks from the Runway for ideas.
 */
const STEPS = [
  { title: 'Pick a challenge, or your own', text: 'A Mehndi in mustard, an Eid in white, or whatever is on your mind: we find the brands that fit.' },
  { title: 'Build the look', text: 'Choose the outfit, then the dupatta, shoes, bag and jewellery from real pieces by Pakistan’s brands.' },
  { title: 'See it, then publish', text: 'Preview it on a model, then put it on the Runway for everyone to like and comment.' },
];

export default function StudioWelcome() {
  const [looks, setLooks] = useState<FeedLook[] | null>(null);

  useEffect(() => {
    api<{ looks: FeedLook[] }>('/feed?sort=trending')
      .then((r) => setLooks(r.looks.filter((l) => l.previewUrl || l.items[0]?.product.images?.[0]).slice(0, 4)))
      .catch(() => setLooks([]));
  }, []);

  return (
    <div className="card p-5 sm:p-7">
      <h2 className="text-xl font-semibold">How it works</h2>
      <ol className="mt-4 grid gap-3 sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="rounded-2xl bg-ivory p-4">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-plum text-sm font-semibold text-white" aria-hidden="true">{i + 1}</span>
            <p className="mt-3 font-semibold">{s.title}</p>
            <p className="mt-1 text-sm text-ink/70">{s.text}</p>
          </li>
        ))}
      </ol>

      <div className="mt-7 flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">Trending on the Runway</h2>
        <Link href="/runway" className="text-sm font-semibold text-plum underline-offset-2 hover:underline">See all ›</Link>
      </div>
      {looks === null ? (
        <ul className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Loading looks">
          {Array.from({ length: 4 }, (_, k) => (
            <li key={k} className="aspect-[3/4] animate-pulse rounded-2xl bg-sand" />
          ))}
        </ul>
      ) : looks.length === 0 ? (
        <p className="mt-3 rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-ink/70">No looks yet: yours could be the first on the Runway.</p>
      ) : (
        <ul className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          {looks.map((l) => {
            const img = l.previewUrl ?? l.items[0]?.product.images?.[0];
            return (
              <li key={l.id}>
                <Link href={`/runway/${l.id}`} className="group block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo(img, 400)} decoding="async" alt={`${l.by}’s ${l.challenge?.title ?? 'look'}`} loading="lazy" referrerPolicy="no-referrer" className="aspect-[3/4] w-full rounded-2xl bg-sand object-cover object-top transition group-hover:opacity-90" />
                  <p className="mt-1.5 truncate text-sm font-semibold">{l.by}</p>
                  <p className="truncate text-xs text-ink/65">
                    <span className="text-plum">♥ {l.up}</span> · {l.challenge?.title ?? 'A look'}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
