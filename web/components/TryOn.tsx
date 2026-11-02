'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef } from 'react';
import BodyFigure from '@/components/BodyFigure';
import { outfitFromLook } from '@/lib/outfit';
import { rupees } from '@/lib/api';
import { useAvatar } from '@/lib/useAvatar';
import type { Look } from '@/lib/types';

const SLOT_LABEL: Record<string, string> = { main: 'Outfit', bottom: 'Bottom', dupatta: 'Dupatta / scarf', footwear: 'Shoes', bag: 'Bag', jewelry: 'Jewellery' };

/** A look worn by the shopper's own 3D avatar, in a dialog. Drag to turn. */
export default function TryOn({ look, onClose }: { look: Look; onClose: () => void }) {
  const { info, error } = useAvatar();
  const outfit = useMemo(() => (info ? outfitFromLook(look, { hijab: info.hijab }) : undefined), [look, info]);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={`${look.label} on your avatar`} onClick={onClose}>
      <div className="flex max-h-[100dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl bg-ivory shadow-xl sm:max-h-[92vh] sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-gold">{look.label} · try-on</div>
            <div className="font-display text-lg">{rupees(look.total)}</div>
          </div>
          <button ref={closeRef} className="btn btn-ghost px-4 py-2" onClick={onClose}>Close</button>
        </div>

        <div className="grid min-h-0 flex-1 overflow-y-auto sm:grid-cols-[1fr_280px]">
          <div className="relative bg-gradient-to-b from-plum-soft to-ivory">
            {info && outfit ? (
              <BodyFigure
                gender={info.gender}
                shape={info.bodyShape}
                heightCm={info.heightCm}
                weightKg={info.weightKg}
                skinHex={info.skinHex}
                face={info.face}
                outfit={outfit}
                interactive
                className="h-[58vh] cursor-grab active:cursor-grabbing sm:h-[70vh]"
              />
            ) : (
              <div className="flex h-[58vh] items-center justify-center text-sm text-ink/60 sm:h-[70vh]">{error || 'Dressing your avatar…'}</div>
            )}
            <span className="absolute bottom-2 right-3 text-[11px] text-ink/45">Drag to turn</span>
          </div>

          <aside className="space-y-4 p-5">
            <ul className="space-y-2.5">
              {look.items.map(({ slot, product }) => (
                <li key={slot} className="flex items-center gap-3">
                  {product.images?.[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.images[0]} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-12 w-9 shrink-0 rounded-lg border border-line object-cover object-top" style={{ background: product.hex }} />
                  ) : (
                    <div className="h-9 w-9 shrink-0 rounded-lg border border-line" style={{ background: product.hex }} aria-hidden="true" />
                  )}
                  <div className="min-w-0">
                    <div className="text-[11px] uppercase tracking-wide text-ink/50">{SLOT_LABEL[slot] ?? slot}</div>
                    <div className="truncate text-sm font-medium capitalize">{product.title}</div>
                  </div>
                </li>
              ))}
            </ul>
            {outfit?.drape?.ownScarf && (
              <p className="rounded-xl bg-plum-soft p-3 text-xs text-plum-dark">This look has no scarf, so your avatar wears a plain one of your own.</p>
            )}
            {info && !info.face && (
              <p className="rounded-xl border border-line p-3 text-xs text-ink/70">
                Want it to look like you? <Link href="/account" className="font-semibold text-plum underline">Add your face and measurements</Link> on your account page.
              </p>
            )}
            <p className="text-[11px] text-ink/45">
              A guide to colour, length and silhouette, not an exact fit. Fabric prints and embroidery are illustrated.
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}
