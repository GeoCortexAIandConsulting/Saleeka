'use client';
import { useEffect, useRef, useState } from 'react';
import { api, rupees } from '@/lib/api';
import { PALETTE_HEX } from '@/lib/palette';
import QuickView from '@/components/QuickView';
import type { PieceGroup, PieceSort, PiecesPage, Product, Slot } from '@/lib/types';

/**
 * The Studio's piece browser for one slot of a challenge: search, brand, colour, price and sort,
 * one card per piece (its other colours as dots), 24 at a time with "Show more".
 * Only pieces that fit the challenge are ever offered (the server checks).
 */

type Range = { label: string; min?: number; max?: number };
const CLOTHES: Range[] = [
  { label: 'Any price' },
  { label: 'Under Rs. 3,000', max: 3000 },
  { label: 'Rs. 3,000 – 8,000', min: 3000, max: 8000 },
  { label: 'Rs. 8,000 – 15,000', min: 8000, max: 15000 },
  { label: 'Over Rs. 15,000', min: 15000 },
];
const SMALL: Range[] = [
  { label: 'Any price' },
  { label: 'Under Rs. 1,500', max: 1500 },
  { label: 'Rs. 1,500 – 3,000', min: 1500, max: 3000 },
  { label: 'Rs. 3,000 – 6,000', min: 3000, max: 6000 },
  { label: 'Over Rs. 6,000', min: 6000 },
];
const SORTS: Array<{ id: PieceSort; label: string }> = [
  { id: 'best', label: 'Best match' },
  { id: 'price-asc', label: 'Price: low to high' },
  { id: 'price-desc', label: 'Price: high to low' },
];

interface Props {
  challengeId: string;
  slot: Slot;
  /** The piece chosen for this slot, if any */
  selected?: Product;
  onPick: (p: Product) => void;
  onRemove: () => void;
}

function Card({ group, selected, onPick, onRemove, main }: { group: PieceGroup; selected?: Product; onPick: (p: Product) => void; onRemove: () => void; main: boolean }) {
  const [details, setDetails] = useState(false);
  const chosenHere = group.variants.findIndex((v) => v.id === selected?.id);
  const [i, setI] = useState(Math.max(0, chosenHere));
  const p = group.variants[Math.min(i, group.variants.length - 1)];
  const on = selected?.id === p.id;
  // One dot per colour: shades the palette names alike (two greys) are the same choice to a shopper.
  const dots = group.variants.map((v, k) => ({ v, k })).filter(({ v }, n, all) => all.findIndex((x) => x.v.colors[0] === v.colors[0]) === n);

  return (
    <li className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-white transition ${on ? 'border-plum ring-2 ring-plum' : 'border-line hover:border-gold hover:shadow-sm'}`}>
      <button type="button" onClick={() => onPick(p)} aria-pressed={on} className="block w-full text-left">
        {p.images?.[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.images[0]} alt="" loading="lazy" referrerPolicy="no-referrer" className="aspect-[3/4] w-full object-cover object-top" style={{ background: p.hex }} />
        ) : (
          <div className="aspect-[3/4] w-full" style={{ background: p.hex }} role="img" aria-label={p.colors.join(' and ')} />
        )}
        <div className="px-2.5 pt-2.5">
          <div className="line-clamp-2 text-xs font-medium capitalize">{p.title}</div>
          <div className="mt-0.5 truncate text-[11px] text-ink/65">{p.brandName}</div>
          <div className="mt-1 flex items-center justify-between text-xs">
            <span className="font-semibold">{rupees(p.price)}</span>
            {main && p.includesBottom && <span className="text-[11px] text-ink/65">{p.includesDupatta ? '3-piece' : 'with bottom'}</span>}
          </div>
        </div>
      </button>
      <div className="flex min-h-[40px] items-center gap-1 px-2.5 pb-2 pt-1">
        {dots.length > 1 &&
          dots.slice(0, 3).map(({ v, k }) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setI(k)}
              aria-label={`See it in ${v.colors[0]}`}
              aria-pressed={p.colors[0] === v.colors[0]}
              title={v.colors[0]}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
            >
              <span
                className={`h-5 w-5 rounded-full border-2 transition ${p.colors[0] === v.colors[0] ? 'border-plum' : 'border-white ring-1 ring-ink/15'}`}
                style={{ background: PALETTE_HEX[v.colors[0]] ?? v.hex }}
              />
            </button>
          ))}
        {dots.length > 3 && (
          <button type="button" onClick={() => setDetails(true)} className="h-7 min-w-[28px] shrink-0 px-1 text-[11px] font-semibold text-ink/65 hover:text-plum" aria-label={`+${dots.length - 3} more colours`}>
            +{dots.length - 3}
          </button>
        )}
        <button
          type="button"
          onClick={() => setDetails(true)}
          aria-label={`Details of ${p.title}`}
          title="Details"
          className="-mr-1 ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-plum hover:bg-plum-soft"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="9" />
            <path strokeLinecap="round" d="M12 11v5.5M12 7.5v.01" />
          </svg>
        </button>
      </div>
      {details && (
        <QuickView
          group={group}
          start={Math.min(i, group.variants.length - 1)}
          selected={selected}
          onPick={onPick}
          onRemove={onRemove}
          onClose={() => setDetails(false)}
        />
      )}
      {on && (
        <>
          <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-plum px-2 py-0.5 text-[11px] font-semibold text-white">✓ Chosen</span>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${p.title} from your look`}
            className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-lg leading-none text-ink shadow hover:bg-white hover:text-red-700"
          >
            ×
          </button>
        </>
      )}
    </li>
  );
}

export default function PieceGrid({ challengeId, slot, selected, onPick, onRemove }: Props) {
  const ranges = ['main', 'bottom', 'dupatta', 'waistcoat'].includes(slot) ? CLOTHES : SMALL;
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [brand, setBrand] = useState('');
  const [color, setColor] = useState('');
  const [range, setRange] = useState(0);
  const [sort, setSort] = useState<PieceSort>('best');
  const [data, setData] = useState<PiecesPage | null>(null);
  const [groups, setGroups] = useState<PieceGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const call = useRef(0);

  // Search as you type, a moment after the last key.
  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const params = (page: number) => {
    const r = ranges[range];
    const s = new URLSearchParams({ slot, sort, page: String(page) });
    if (query) s.set('q', query);
    if (brand) s.set('brand', brand);
    if (color) s.set('color', color);
    if (r.min !== undefined) s.set('min', String(r.min));
    if (r.max !== undefined) s.set('max', String(r.max));
    return s.toString();
  };

  async function load(page: number) {
    const id = ++call.current;
    setLoading(true);
    setError('');
    try {
      const r = await api<PiecesPage>(`/game/challenges/${challengeId}/pieces?${params(page)}`);
      if (id !== call.current) return; // a newer search is on its way
      setData(r);
      setGroups((g) => (page === 1 ? r.groups : [...g, ...r.groups]));
    } catch (e) {
      if (id === call.current) setError((e as Error).message);
    }
    if (id === call.current) setLoading(false);
  }

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challengeId, slot, query, brand, color, range, sort]);

  const filtered = Boolean(query || brand || color || range);
  const clear = () => {
    setQ('');
    setQuery('');
    setBrand('');
    setColor('');
    setRange(0);
  };
  const select = 'h-10 shrink-0 rounded-full border border-line bg-white pl-3 pr-8 text-sm text-ink focus:border-plum focus:outline-none focus:ring-2 focus:ring-plum/20';

  return (
    <div>
      <div className="space-y-2">
        <label className="relative block">
          <span className="sr-only">Search pieces</span>
          <svg aria-hidden="true" viewBox="0 0 20 20" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/65" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="9" cy="9" r="6" />
            <path d="m14 14 4 4" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or brand…"
            className="h-11 w-full rounded-full border border-line bg-white pl-10 pr-4 text-sm focus:border-plum focus:outline-none focus:ring-2 focus:ring-plum/20"
          />
        </label>
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
          <select aria-label="Brand" value={brand} onChange={(e) => setBrand(e.target.value)} className={select}>
            <option value="">All brands</option>
            {data?.brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.count})
              </option>
            ))}
          </select>
          <select aria-label="Colour" value={color} onChange={(e) => setColor(e.target.value)} className={`${select} capitalize`}>
            <option value="">All colours</option>
            {data?.colors.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select aria-label="Price" value={range} onChange={(e) => setRange(Number(e.target.value))} className={select}>
            {ranges.map((r, k) => (
              <option key={r.label} value={k}>
                {r.label}
              </option>
            ))}
          </select>
          <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as PieceSort)} className={select}>
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-h-[20px] items-center justify-between text-xs text-ink/65" aria-live="polite">
          <span>{data ? `${data.total.toLocaleString('en-PK')} piece${data.total === 1 ? '' : 's'}` : ''}</span>
          {filtered && (
            <button type="button" onClick={clear} className="font-semibold text-plum underline-offset-2 hover:underline">
              Clear filters
            </button>
          )}
        </div>
      </div>

      {error && <p className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</p>}

      {groups.length === 0 && loading ? (
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3" aria-hidden="true">
          {Array.from({ length: 6 }, (_, k) => (
            <li key={k} className="overflow-hidden rounded-2xl border border-line bg-white">
              <div className="aspect-[3/4] w-full animate-pulse bg-sand" />
              <div className="space-y-1.5 p-2.5">
                <div className="h-3 w-4/5 animate-pulse rounded bg-sand" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-sand" />
              </div>
            </li>
          ))}
        </ul>
      ) : groups.length === 0 ? (
        <div className="mt-3 rounded-2xl border border-dashed border-line px-4 py-10 text-center text-sm text-ink/70">
          {filtered ? (
            <>
              Nothing matches these filters.{' '}
              <button type="button" onClick={clear} className="font-semibold text-plum underline">
                Clear filters
              </button>
            </>
          ) : (
            'Nothing fits this challenge here.'
          )}
        </div>
      ) : (
        <>
          <ul className={`mt-3 grid grid-cols-2 gap-3 transition-opacity sm:grid-cols-3 ${loading ? 'opacity-60' : ''}`}>
            {groups.map((g) => (
              <Card key={g.key} group={g} selected={selected} onPick={onPick} onRemove={onRemove} main={slot === 'main'} />
            ))}
          </ul>
          {data && data.page < data.pages && (
            <div className="mt-5 text-center">
              <button type="button" className="btn btn-ghost" disabled={loading} onClick={() => load(data.page + 1)}>
                {loading ? 'Loading…' : 'Show more'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
