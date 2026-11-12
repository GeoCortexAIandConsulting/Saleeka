'use client';
import type { SlotState } from '@/components/LookBoard';
import { slotsFor, type FeedLook, type Product, type Slot } from '@/lib/types';

/** Small pieces shared by the Runway feed and a look's own page. */

export const piecesOf = (l: FeedLook) => Object.fromEntries(l.items.map((i) => [i.slot, i.product])) as Partial<Record<Slot, Product>>;
export const statesOf = (l: FeedLook) => {
  const has = new Set(l.items.map((i) => i.slot));
  return Object.fromEntries(slotsFor(l.challenge?.gender).map((s) => [s, has.has(s) ? 'optional' : 'hidden'])) as Partial<Record<Slot, SlotState>>;
};

export function Heart({ on, className = 'h-5 w-5' }: { on: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
      <path strokeLinejoin="round" d="M12 20.5s-7.5-4.6-9.6-9.2C1 8 3 4.5 6.6 4.5c2.1 0 3.6 1.2 5.4 3.2 1.8-2 3.3-3.2 5.4-3.2C21 4.5 23 8 21.6 11.3c-2.1 4.6-9.6 9.2-9.6 9.2Z" />
    </svg>
  );
}

export function LikeButton({ look, onVote, big = false }: { look: FeedLook; onVote: () => void; big?: boolean }) {
  const on = look.myVote === 'up';
  return (
    <button
      type="button"
      onClick={onVote}
      aria-pressed={on}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 font-semibold transition ${big ? 'min-h-[44px] text-base' : 'min-h-[38px] text-sm'} ${on ? 'border-plum/30 bg-plum-soft text-plum' : 'border-line bg-white text-ink/75 hover:border-gold'}`}
    >
      <Heart on={on} className={big ? 'h-6 w-6' : 'h-5 w-5'} />
      <span className="sr-only">Like, </span>
      {look.up}
      <span className="sr-only"> {look.up === 1 ? 'like' : 'likes'}</span>
    </button>
  );
}

export function AiBadge() {
  return <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-plum-dark shadow-sm">AI preview</span>;
}

/** The big heart that pops over a look when it is double-tapped (keyed, so each tap replays it). */
export function HeartBurst() {
  return (
    <span className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
      <svg viewBox="0 0 24 24" className="heart-burst h-24 w-24 text-white drop-shadow-[0_6px_18px_rgba(107,45,92,0.55)]" fill="currentColor">
        <path d="M12 20.5s-7.5-4.6-9.6-9.2C1 8 3 4.5 6.6 4.5c2.1 0 3.6 1.2 5.4 3.2 1.8-2 3.3-3.2 5.4-3.2C21 4.5 23 8 21.6 11.3c-2.1 4.6-9.6 9.2-9.6 9.2Z" />
      </svg>
    </span>
  );
}
