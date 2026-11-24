'use client';
import { useEffect, useRef, useState } from 'react';
import { rupees } from '@/lib/api';
import { PALETTE_HEX } from '@/lib/palette';
import type { PieceGroup, Product } from '@/lib/types';
import { photo as sized } from '@/lib/photo';

/**
 * A closer look at a piece before choosing it: every photo, its colours, fabric, what the outfit
 * comes with, and the sizes in stock. Uses the browser's own dialog, so Escape, focus and
 * screen readers behave as expected.
 */
const WORK = ['Plain', 'Light work', 'Embroidered', 'Heavy work'];
const SLEEVE: Record<string, string> = { sleeveless: 'Sleeveless', short: 'Short sleeves', 'three-quarter': '¾ sleeves', full: 'Full sleeves' };

interface Props {
  group: PieceGroup;
  start: number;
  /** The pieces chosen for this slot (jewellery and accessories can have several) */
  selected: Product[];
  /** Picking another piece replaces the chosen one (a one-piece slot) */
  swaps: boolean;
  onPick: (p: Product) => void;
  onRemove: (p: Product) => void;
  onClose: () => void;
}

export default function QuickView({ group, start, selected, swaps, onPick, onRemove, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [i, setI] = useState(start);
  const [photo, setPhoto] = useState(0);
  const p = group.variants[i] ?? group.variants[0];
  const photos = p.images?.length ? p.images : [];
  const on = selected.some((x) => x.id === p.id);
  const colours = group.variants.map((v, k) => ({ v, k })).filter(({ v }, n, all) => all.findIndex((x) => x.v.colors[0] === v.colors[0]) === n);

  // Open as a modal once shown. No close() on cleanup: React's development double-mount would
  // close it straight away, and an unmounted dialog leaves the screen by itself.
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  const facts = [
    p.slot === 'main' && (p.includesBottom ? (p.includesDupatta ? '3-piece: shirt, bottom and dupatta' : '2-piece: with its bottom') : 'Shirt only'),
    p.fabric && `${p.fabric.charAt(0).toUpperCase()}${p.fabric.slice(1)}`,
    p.slot === 'main' && (p.stitched ? 'Ready to wear' : 'Unstitched'),
    p.sleeve && SLEEVE[p.sleeve],
    p.embellishment !== undefined && WORK[p.embellishment],
  ].filter(Boolean) as string[];

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && ref.current?.close()}
      className="m-auto max-h-[92vh] w-[min(920px,calc(100vw-24px))] overflow-hidden rounded-3xl border border-line bg-white p-0 text-ink shadow-2xl backdrop:bg-ink/50"
      aria-label={p.title}
    >
      <div className="grid max-h-[92vh] overflow-y-auto md:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <div className="bg-sand/40 p-3">
          {photos[photo] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={sized(photos[photo], 900)} alt={p.title} referrerPolicy="no-referrer" className="mx-auto aspect-[3/4] max-h-[40vh] md:max-h-[62vh] w-auto rounded-2xl object-contain" style={{ background: p.hex }} />
          ) : (
            <div className="mx-auto aspect-[3/4] max-h-[40vh] md:max-h-[62vh] rounded-2xl" style={{ background: p.hex }} />
          )}
          {photos.length > 1 && (
            <div className="no-scrollbar mt-2 flex justify-center gap-2 overflow-x-auto">
              {photos.map((src, k) => (
                <button key={src} type="button" onClick={() => setPhoto(k)} aria-label={`Photo ${k + 1}`} aria-pressed={k === photo} className={`shrink-0 overflow-hidden rounded-lg border-2 ${k === photo ? 'border-plum' : 'border-transparent'}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={sized(src, 120)} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="h-12 w-9 object-cover object-top md:h-16 md:w-12" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink/65">{p.brandName}</p>
              <h2 className="mt-1 text-xl font-semibold capitalize leading-snug">{p.title}</h2>
            </div>
            <button type="button" onClick={() => ref.current?.close()} aria-label="Close" className="-mr-2 -mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-2xl leading-none text-ink/65 hover:bg-sand">
              ×
            </button>
          </div>
          <p className="mt-2 text-lg font-semibold">{rupees(p.price)}</p>

          {colours.length > 1 && (
            <div className="mt-4">
              <p className="text-xs text-ink/65">
                Colour: <span className="font-semibold capitalize text-ink">{p.colors[0]}</span>
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {colours.map(({ v, k }) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => {
                      setI(k);
                      setPhoto(0);
                    }}
                    aria-label={v.colors[0]}
                    aria-pressed={p.colors[0] === v.colors[0]}
                    title={v.colors[0]}
                    className={`h-8 w-8 rounded-full border-2 ${p.colors[0] === v.colors[0] ? 'border-plum' : 'border-white ring-1 ring-ink/15'}`}
                    style={{ background: PALETTE_HEX[v.colors[0]] ?? v.hex }}
                  />
                ))}
              </div>
            </div>
          )}

          {facts.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-1.5">
              {facts.map((f) => (
                <li key={f} className="rounded-full bg-ivory px-3 py-1 text-xs text-ink/80">{f}</li>
              ))}
            </ul>
          )}
          {p.sizes && p.sizes.length > 0 && (
            <p className="mt-3 text-xs text-ink/65">
              In stock: <span className="text-ink">{p.sizes.slice(0, 8).join(' · ')}</span>
            </p>
          )}

          <div className="sticky bottom-0 -mx-5 -mb-5 mt-auto flex flex-col gap-2 border-t border-line bg-white px-5 pb-5 pt-4 md:static md:m-0 md:mt-auto md:border-0 md:p-0 md:pt-6">
            {on ? (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  onRemove(p);
                  ref.current?.close();
                }}
              >
                ✓ In your look · Remove
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  onPick(p);
                  ref.current?.close();
                }}
              >
                {swaps && selected.length ? 'Swap into my look' : 'Add to my look'}
              </button>
            )}
            <a href={`/api/go/${p.id}`} target="_blank" rel="noopener noreferrer" className="text-center text-sm text-plum underline-offset-2 hover:underline">
              View on {p.brandName}’s site ↗
            </a>
          </div>
        </div>
      </div>
    </dialog>
  );
}
