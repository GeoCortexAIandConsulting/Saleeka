'use client';
import type { Gender, Product, Slot } from '@/lib/types';
import { photo as sized } from '@/lib/photo';

/**
 * The look board: the outfit as worn, large on the left, and the pieces that complete it stacked
 * down the right (women: bottom, dupatta, a coat or jacket, shoes, bag, jewellery; men: bottom, waistcoat,
 * a coat or jacket, shoes and an accessory), like a styled flat-lay. Product photos
 * shot on white blend into the cream background, so accessories read as cut-outs. Empty slots are
 * dashed tiles (plum when the look still needs them); every tile can be tapped to choose that slot.
 */

export type SlotState = 'required' | 'optional' | 'included' | 'hidden';

interface Props {
  /** One piece per slot, or several (jewellery and accessories: up to three, shown side by side) */
  pieces: Partial<Record<Slot, Product | Product[]>>;
  /** How each empty slot should look; missing slots show as optional */
  states?: Partial<Record<Slot, SlotState>>;
  active?: Slot | null;
  onSlot?: (slot: Slot) => void;
  className?: string;
  label?: string;
  /** Small boards (ratings, "My designs"): no captions or empty-slot labels */
  compact?: boolean;
  /** A men's look shows the men's pieces down the side */
  gender?: Gender;
}

const NAMES: Record<Slot, string> = { main: 'Outfit', bottom: 'Bottom', dupatta: 'Dupatta', footwear: 'Shoes', bag: 'Bag', jewelry: 'Jewellery', waistcoat: 'Waistcoat', accessory: 'Accessories', layer: 'Coat / jacket' };
const SIDE: Record<Gender, Slot[]> = { female: ['bottom', 'dupatta', 'layer', 'footwear', 'bag', 'jewelry', 'accessory'], male: ['bottom', 'waistcoat', 'layer', 'footwear', 'accessory'] };
/** Clothes are photographed on a model, so their photos fill the tile. */
const WORN: Slot[] = ['bottom', 'dupatta', 'waistcoat', 'layer'];
const rupees = (n: number) => `Rs. ${n.toLocaleString('en-PK')}`;

export default function LookBoard({ pieces, states = {}, active, onSlot, className = '', label, compact = false, gender = 'female' }: Props) {
  const tile = (slot: Slot, shape: string) => {
    const got = pieces[slot];
    const all = got ? (Array.isArray(got) ? got : [got]) : [];
    const p = all[0];
    const state = states[slot] ?? 'optional';
    if (!p && (state === 'hidden' || state === 'included')) return null;
    const Tag = onSlot ? 'button' : 'div';
    const tap = onSlot ? { type: 'button' as const, onClick: () => onSlot(slot) } : {};
    const ring = active === slot ? 'ring-2 ring-plum ring-offset-2 ring-offset-[#FBF3EA]' : '';

    if (!p) {
      return (
        <Tag
          key={slot}
          {...tap}
          {...(compact ? { 'aria-label': `${NAMES[slot]}, ${state === 'required' ? 'needed' : 'optional'}`, ...(onSlot ? {} : { role: 'img' }) } : {})}
          className={`${shape} ${ring} flex flex-col items-center justify-center rounded-xl border-2 border-dashed text-center transition-colors ${
            state === 'required' ? 'border-plum/45 text-plum-dark' : 'border-[#D9C9B6] text-ink/65'
          } ${onSlot ? 'hover:border-plum hover:bg-plum-soft/60' : ''}`}
        >
          {!compact && (
            <span className="px-1 text-[11px] font-semibold leading-tight">
              <span aria-hidden="true">+ </span>
              {NAMES[slot]}
              {state === 'required' && <span className="block text-[11px] font-normal opacity-70">needed</span>}
            </span>
          )}
        </Tag>
      );
    }

    // Several pieces in one slot (earrings, a ring and a bracelet): side by side in the one tile.
    if (all.length > 1) {
      return (
        <Tag
          key={`${slot}-${all.map((x) => x.id).join('+')}`}
          {...tap}
          title={all.map((x) => `${x.title} · ${x.brandName} · ${rupees(x.price)}`).join('\n')}
          aria-label={onSlot ? `${NAMES[slot]}: ${all.map((x) => x.title).join(', ')}` : undefined}
          className={`piece-in relative flex gap-0.5 overflow-hidden rounded-xl bg-white/50 ${shape} ${ring}`}
        >
          {all.map((x) =>
            x.images?.[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={x.id}
                src={sized(x.images[0], 260)}
                decoding="async"
                alt={`${x.title} by ${x.brandName}`}
                referrerPolicy="no-referrer"
                className="h-full min-w-0 flex-1 object-contain p-0.5 mix-blend-multiply"
                onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
              />
            ) : (
              <span key={x.id} className="h-full min-w-0 flex-1 rounded-lg" style={{ background: x.hex }} role="img" aria-label={x.title} />
            ),
          )}
          {!compact && <span className="absolute bottom-0.5 right-1 rounded-full bg-white/90 px-1.5 text-[10px] font-semibold text-plum-dark">{all.length}</span>}
        </Tag>
      );
    }

    const photo = p.images?.[0];
    const isMain = slot === 'main';
    // Clothing photos are worn by a model; accessories are usually shot on white.
    const fit = isMain ? 'object-cover object-top' : WORN.includes(slot) ? 'object-cover object-center' : 'object-contain mix-blend-multiply p-1';
    return (
      <Tag
        key={`${slot}-${p.id}`}
        {...tap}
        title={`${p.title} · ${p.brandName} · ${rupees(p.price)}`}
        className={`piece-in relative block overflow-hidden ${isMain ? 'rounded-2xl' : 'rounded-xl'} ${shape} ${ring}`}
        style={{ background: photo ? (isMain || WORN.includes(slot) ? p.hex : 'transparent') : p.hex }}
      >
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={sized(photo, isMain ? 640 : 280)}
            // The outfit is usually the biggest thing on screen: fetch it first, decode it straight away.
            decoding={isMain ? 'sync' : 'async'}
            fetchPriority={isMain && !compact ? 'high' : 'auto'}
            alt={`${p.title} by ${p.brandName}`}
            referrerPolicy="no-referrer"
            className={`h-full w-full ${fit}`}
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
        )}
        {isMain && !compact && (
          <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-night/70 to-transparent px-3 pb-2.5 pt-8 text-left text-xs text-white">
            <span className="block truncate font-semibold">{p.brandName}</span>
            <span className="block truncate opacity-90">{rupees(p.price)}</span>
          </span>
        )}
      </Tag>
    );
  };

  const side = SIDE[gender].map((s) => tile(s, 'min-h-0 w-full flex-1')).filter(Boolean);

  return (
    <div
      role="group"
      aria-label={label ?? 'Your look'}
      className={`grid grid-cols-[1.45fr_1fr] rounded-[1.5rem] bg-[#FBF3EA] ${compact ? 'gap-1.5 p-1.5' : 'gap-3 p-3'} ${className}`}
    >
      <div>{tile('main', 'aspect-[3/5] w-full')}</div>
      {/* The pieces share the outfit photo's height, however tall their own photos are. */}
      <div className="relative">
        <div className={`absolute inset-0 flex flex-col ${compact ? 'gap-1' : 'gap-2'}`}>{side}</div>
      </div>
    </div>
  );
}
