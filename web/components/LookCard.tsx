'use client';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import type { Look, Slot } from '@/lib/types';
import { rupees } from '@/lib/api';
import { photo } from '@/lib/photo';

// The 3D try-on (and three.js) loads only when someone opens it.
const TryOn = dynamic(() => import('@/components/TryOn'), { ssr: false });

const SLOT_LABEL: Record<Slot, string> = {
  main: 'Outfit',
  bottom: 'Bottom',
  dupatta: 'Dupatta / scarf',
  footwear: 'Shoes',
  bag: 'Bag',
  jewelry: 'Jewellery',
  waistcoat: 'Waistcoat',
  accessory: 'Accessory',
  layer: 'Coat / jacket',
};

export interface LookCardProps {
  look: Look;
  rank?: number | null; // 1-based rank badge
  onSelect?: () => void;
  selected?: boolean;
  onSave?: () => void;
  onSwap?: (slot: Slot) => void;
  swapping?: Slot | null;
  showReason?: boolean;
  compact?: boolean;
}

export default function LookCard({ look, rank, onSelect, selected, onSave, onSwap, swapping, showReason = true, compact }: LookCardProps) {
  const [trying, setTrying] = useState(false);
  const main = look.items.find((i) => i.slot === 'main')?.product;
  const mainPhoto = main?.images?.[0];
  // Oldest stock check among the pieces, shown as a short date.
  const checkedAt = look.items.map((i) => i.product.checkedAt).filter(Boolean).sort()[0];
  const checked = checkedAt ? new Date(checkedAt).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' }) : '';
  const body = (
    <>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-gold">{look.label}</div>
          <div className="font-display text-xl">{rupees(look.total)}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-full border border-plum/30 bg-white px-3 py-1.5 text-xs font-semibold text-plum transition hover:border-plum hover:bg-plum-soft"
            onClick={(e) => {
              e.stopPropagation();
              setTrying(true);
            }}
            onKeyDown={(e) => e.stopPropagation()}
          >
            Try it on me
          </button>
          {rank ? (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-plum text-base font-bold text-white" aria-label={`Ranked ${rank}`}>
              {rank}
            </div>
          ) : null}
        </div>
      </div>

      {mainPhoto ? (
        // The main piece's own photo, shown from the brand's site.
        <a
          href={`/api/go/${encodeURIComponent(main!.id)}?look=${look.id}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="mb-3 block overflow-hidden rounded-2xl border border-line bg-plum-soft"
          title={`${main!.title} on ${main!.brandName}'s website`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo(mainPhoto, 720)}
            decoding="async"
            alt={`${main!.title} by ${main!.brandName}`}
            loading="lazy"
            referrerPolicy="no-referrer"
            className={`w-full object-cover object-top ${compact ? 'h-56' : 'h-72'}`}
          />
        </a>
      ) : (
        /* A colour strip gives the look an at-a-glance identity */
        <div className="mb-3 flex h-3 overflow-hidden rounded-full border border-line">
          {look.items.map((i) => (
            <div key={i.slot} style={{ background: i.product.hex, flex: i.slot === 'main' ? 3 : 1 }} />
          ))}
        </div>
      )}

      <ul className="divide-y divide-line">
        {look.items.map(({ slot, product }) => (
          <li key={slot} className="flex items-center gap-3 py-2.5">
            {product.images?.[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photo(product.images[0], 120)}
                decoding="async"
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                className="h-14 w-11 shrink-0 rounded-xl border border-line object-cover object-top"
                style={{ background: product.hex }}
              />
            ) : (
              <div
                className="h-11 w-11 shrink-0 rounded-xl border border-line"
                style={{ background: product.hex }}
                role="img"
                aria-label={product.colors.join(' and ')}
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-[11px] uppercase tracking-wide text-ink/65">{SLOT_LABEL[slot]}</div>
              <div className="truncate text-sm font-medium capitalize">{product.title}</div>
              <div className="truncate text-xs text-ink/65">
                {product.brandName}
                {slot === 'main' && !product.stitched ? ' · unstitched fabric' : ''}
                {slot === 'main' && product.includesDupatta ? ' · dupatta included' : ''}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-sm font-semibold">{rupees(product.price)}</div>
              {!compact && (
                <div className="flex justify-end gap-2 text-xs">
                  {onSwap && (
                    <button
                      className="text-plum underline-offset-2 hover:underline disabled:opacity-50"
                      disabled={swapping === slot}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSwap(slot);
                      }}
                    >
                      {swapping === slot ? '…' : 'Swap'}
                    </button>
                  )}
                  <a
                    className="text-plum underline-offset-2 hover:underline"
                    href={`/api/go/${encodeURIComponent(product.id)}?look=${look.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    View
                  </a>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>

      {showReason && look.reason ? <p className="mt-3 rounded-xl bg-plum-soft p-3 text-sm text-plum-dark">{look.reason}</p> : null}
      {onSave && (
        <button className="btn btn-ghost mt-3 w-full" onClick={onSave}>
          {look.saved ? 'Saved ✓ (tap to remove)' : 'Save this look'}
        </button>
      )}
      <p className="mt-2 text-[11px] text-ink/65">
        {look.items.some((i) => i.product.demo)
          ? 'Demo products for testing. Prices and links are placeholders.'
          : `Photos, prices and stock from each brand's official website${checked ? `, checked ${checked}` : ''}. Saleeqa prototype, not affiliated with the brands.`}
      </p>
      {trying && <TryOn look={look} onClose={() => setTrying(false)} />}
    </>
  );

  if (onSelect) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect()}
        className={`card cursor-pointer text-left transition ${selected ? 'border-plum ring-2 ring-plum/30' : 'hover:border-plum/50'}`}
      >
        {body}
      </div>
    );
  }
  return <div className="card">{body}</div>;
}
