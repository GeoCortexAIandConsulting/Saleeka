'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import LookBoard from '@/components/LookBoard';
import { ago } from '@/components/LookComments';
import { AiBadge, HeartBurst, LikeButton, piecesOf, statesOf } from '@/components/LookParts';
import { rupees } from '@/lib/api';
import { castVote } from '@/lib/vote';
import type { FeedLook } from '@/lib/types';
import { photo } from '@/lib/photo';

/** A look on the Runway or a player's page: its image, who made it, its pieces, likes and comments. */
export default function LookTile({ look, onChange }: { look: FeedLook; onChange: (l: FeedLook) => void }) {
  const href = `/runway/${look.id}`;
  const router = useRouter();
  const tap = useRef<number | null>(null);
  const [burst, setBurst] = useState(0);

  /**
   * Tapping the image opens the look; tapping twice quickly likes it (as on Instagram). Keyboard
   * (Enter) and Ctrl/Cmd-click keep working as a normal link.
   */
  function onImage(e: React.MouseEvent) {
    if (e.detail === 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    if (tap.current) {
      clearTimeout(tap.current);
      tap.current = null;
      setBurst((b) => b + 1);
      if (look.myVote !== 'up') castVote(look, 'up', onChange);
      return;
    }
    tap.current = window.setTimeout(() => {
      tap.current = null;
      router.push(href);
    }, 260);
  }

  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-3xl border border-line bg-white shadow-[0_10px_30px_-22px_rgb(79_31_68/0.35)] transition hover:shadow-[0_16px_36px_-20px_rgb(79_31_68/0.45)]">
      <Link href={href} onClick={onImage} className="relative block select-none" title="Double-tap to like">
        {look.previewUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={look.previewUrl} alt={`${look.by}’s look on a model (AI preview)`} loading="lazy" className="aspect-[4/5] w-full bg-sand object-cover object-top" />
            <AiBadge />
          </>
        ) : (
          <div className="p-3">
            <LookBoard pieces={piecesOf(look)} states={statesOf(look)} gender={look.challenge?.gender} compact className="w-full" />
          </div>
        )}
        {burst > 0 && <HeartBurst key={burst} />}
      </Link>

      <div className="flex flex-1 flex-col p-3.5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-plum-soft text-sm font-semibold text-plum-dark" aria-hidden="true">
            {look.by.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              <Link href={`/u/${look.byId}`} className="hover:text-plum hover:underline">{look.by}</Link>
              {look.mine && <span className="ml-1.5 rounded-full bg-sand px-2 py-0.5 text-[11px] font-semibold text-ink/65">You</span>}
            </p>
            <p className="truncate text-xs text-ink/65">
              {look.challenge?.title ?? 'A look'} · {ago(look.createdAt)}
            </p>
          </div>
        </div>

        {/* The pieces at a glance; the look's page lists them to shop. */}
        <Link href={href} className="mt-3 flex items-center gap-1.5">
          {look.items.slice(0, 5).map(({ slot, product }) =>
            product.images?.[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={slot} src={photo(product.images[0], 100)} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="h-10 w-10 rounded-lg border border-line object-cover object-top" style={{ background: product.hex }} />
            ) : (
              <span key={slot} className="h-10 w-10 rounded-lg border border-line" style={{ background: product.hex }} />
            ),
          )}
          <span className="ml-auto whitespace-nowrap text-xs font-semibold text-plum">Shop the look ›</span>
        </Link>

        <div className="mt-auto flex items-center gap-2 pt-3">
          <LikeButton look={look} onVote={() => castVote(look, 'up', onChange)} />
          <Link href={`${href}#comments`} className="chip !min-h-[38px] !py-1.5 text-ink/75" aria-label={`${look.comments} comment${look.comments === 1 ? '' : 's'}`}>
            💬 <span className="ml-1.5">{look.comments}</span>
          </Link>
          <span className="ml-auto text-sm font-semibold">{rupees(look.total)}</span>
        </div>
      </div>
    </article>
  );
}
