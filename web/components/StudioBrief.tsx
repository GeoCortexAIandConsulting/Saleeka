'use client';
import { useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import type { BriefResult, Challenge, Gender } from '@/lib/types';

const OCCASIONS: Array<[string, string]> = [
  ['casual', 'Everyday'],
  ['office', 'Office'],
  ['university', 'University'],
  ['party', 'Party / dinner'],
  ['eid', 'Eid'],
  ['mehndi', 'Mehndi'],
  ['baraat', 'Baraat'],
  ['walima', 'Walima'],
];
const COLOURS = ['black', 'white', 'red', 'pink', 'green', 'blue', 'yellow', 'purple', 'orange', 'brown', 'grey', 'gold', 'pastel'];
const BUDGETS: Array<[string, string]> = [
  ['budget', 'Budget-friendly'],
  ['mid', 'Mid-range'],
  ['premium', 'Premium'],
];
const TIER_LABEL: Record<string, string> = Object.fromEntries(BUDGETS);
const RELAXED: Record<string, string> = {
  colour: 'the colour',
  price: 'the price limit',
  budget: 'the budget',
  season: 'the season',
  brands: 'the brands you kept',
};

const EXAMPLES: Record<Gender, string[]> = {
  female: ['Something casual in black', 'A modest Eid look in pastels', 'Cosy winter office wear', 'Dinner with friends, under 8k'],
  male: ['A white kurta for Eid', 'Smart winter wedding guest', 'Easy everyday shalwar kameez', 'Office wear in navy'],
};

const select =
  'h-10 w-full min-w-0 rounded-full border border-line bg-white pl-3 pr-6 text-sm text-ink focus:border-plum focus:outline-none focus:ring-2 focus:ring-plum/20';

/**
 * "What's on your mind today?": the player describes a look in their own words and/or picks from a
 * few dropdowns; the server turns it into a private challenge and lists the brands that fit. The
 * player can keep only some of those brands, then starts styling.
 */
export default function StudioBrief({
  gender,
  onGender,
  onStart,
  tags,
}: {
  gender: Gender;
  onGender: (g: Gender) => void;
  onStart: (c: Challenge) => void;
  /** How a challenge's colours and rules are shown (shared with the challenge list) */
  tags: (c: Challenge) => ReactNode;
}) {
  const [text, setText] = useState('');
  const [occasion, setOccasion] = useState('');
  const [colour, setColour] = useState('');
  const [budget, setBudget] = useState('');
  const [coverage, setCoverage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<BriefResult | null>(null);
  const [kept, setKept] = useState<string[]>([]);
  const [allBrands, setAllBrands] = useState(false);

  const body = (brands?: string[]) => ({
    text: text.trim() || undefined,
    gender,
    occasion: occasion || undefined,
    colour: colour || undefined,
    budget: budget || undefined,
    coverage: gender === 'female' && coverage ? coverage : undefined,
    brands: brands?.length ? brands : undefined,
  });

  async function find(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy) return;
    if (!text.trim() && !occasion && !colour && !budget && !coverage) return setError('Write a few words, or pick an occasion.');
    setBusy(true);
    setError('');
    try {
      const r = await api<BriefResult>('/game/briefs', { body: body() });
      setResult(r);
      setKept([]);
      setAllBrands(false);
      if (r.challenge.gender !== gender) onGender(r.challenge.gender);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    if (!result || busy) return;
    if (!kept.length) return onStart(result.challenge);
    setBusy(true);
    try {
      const r = await api<BriefResult>('/game/briefs', { body: { ...body(kept), gender: result.challenge.gender } });
      onStart(r.challenge);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const toggle = (id: string) => setKept((k) => (k.includes(id) ? k.filter((x) => x !== id) : [...k, id]));

  if (result) {
    const { challenge: c, brands, relaxed } = result;
    const shown = allBrands ? brands : brands.slice(0, 10);
    return (
      <section className="rounded-2xl border border-gold/60 bg-ivory p-3" aria-labelledby="brief-title">
        <p className="eyebrow">Your brief</p>
        <h3 id="brief-title" className="mt-1 text-sm font-semibold">{c.title}</h3>
        {tags(c)}
        {(c.tiers?.length || c.maxPrice) && (
          <p className="mt-1 text-xs text-ink/70">
            {c.tiers?.map((t) => TIER_LABEL[t]).join(', ')}
            {c.tiers?.length && c.maxPrice ? ' · ' : ''}
            {c.maxPrice ? `outfits up to Rs ${c.maxPrice.toLocaleString('en-PK')}` : ''}
          </p>
        )}
        {relaxed.length > 0 && (
          <p className="mt-2 rounded-xl bg-white px-2.5 py-1.5 text-xs text-ink/75">
            Nothing in stock matched {relaxed.map((r) => RELAXED[r] ?? r).join(' and ')}, so we let {relaxed.length > 1 ? 'those' : 'it'} go.
          </p>
        )}

        <h4 className="mt-3 text-xs font-semibold uppercase tracking-wide text-ink/70">Brands that fit ({brands.length})</h4>
        <p className="mt-0.5 text-xs text-ink/65">Tap the ones you like to see only them. None picked: every brand.</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {shown.map((b) => {
            const on = kept.includes(b.id);
            return (
              <button
                key={b.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(b.id)}
                className={`min-h-[40px] rounded-full border px-3 text-xs font-medium transition-colors ${on ? 'border-plum bg-plum text-white' : 'border-line bg-white text-ink/80 hover:border-gold'}`}
              >
                {b.name} <span className={on ? 'text-white/80' : 'text-ink/65'}>· {b.count}</span>
              </button>
            );
          })}
          {brands.length > 10 && (
            <button type="button" onClick={() => setAllBrands((x) => !x)} className="min-h-[40px] px-2 text-xs font-medium text-plum underline-offset-2 hover:underline">
              {allBrands ? 'Fewer' : `+${brands.length - 10} more`}
            </button>
          )}
        </div>

        {error && <p className="mt-2 text-xs text-red-700" role="alert">{error}</p>}
        <div className="mt-3 flex gap-2">
          <button type="button" className="btn btn-primary !min-h-[40px] flex-1 !px-4 !py-2 text-sm" onClick={start} disabled={busy}>
            {busy ? 'Opening…' : kept.length ? `Style with ${kept.length} brand${kept.length === 1 ? '' : 's'}` : 'Start styling'}
          </button>
          <button type="button" className="btn btn-ghost !min-h-[40px] !px-4 !py-2 text-sm" onClick={() => setResult(null)} disabled={busy}>
            Change
          </button>
        </div>
      </section>
    );
  }

  return (
    <form onSubmit={find} className="rounded-2xl border border-line bg-ivory p-3" aria-labelledby="brief-ask">
      <label id="brief-ask" htmlFor="brief-text" className="text-sm font-semibold">
        What’s on your mind today?
      </label>
      <p className="mt-0.5 text-xs text-ink/70">Describe any look in your own words, or pick a few options.</p>
      <textarea
        id="brief-text"
        className="input mt-2 min-h-[72px] text-sm"
        maxLength={300}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) find(e);
        }}
        placeholder={gender === 'male' ? 'e.g. a smart kurta for a winter wedding, nothing too shiny' : 'e.g. something casual in black for a winter evening, under 8k'}
      />
      <div className="no-scrollbar -mx-1 mt-1.5 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {EXAMPLES[gender].map((x) => (
          <button key={x} type="button" onClick={() => setText(x)} className="min-h-[40px] shrink-0 rounded-full border border-line bg-white px-3 text-xs text-ink/75 hover:border-gold">
            {x}
          </button>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <select aria-label="Occasion" value={occasion} onChange={(e) => setOccasion(e.target.value)} className={select}>
          <option value="">Occasion</option>
          {OCCASIONS.map(([id, label]) => (
            <option key={id} value={id}>{label}</option>
          ))}
        </select>
        <select aria-label="Colour" value={colour} onChange={(e) => setColour(e.target.value)} className={select}>
          <option value="">Colour</option>
          {COLOURS.map((c) => (
            <option key={c} value={c}>{c === 'pastel' ? 'Pastels' : c[0].toUpperCase() + c.slice(1)}</option>
          ))}
        </select>
        <select aria-label="Budget" value={budget} onChange={(e) => setBudget(e.target.value)} className={select}>
          <option value="">Budget</option>
          {BUDGETS.map(([id, label]) => (
            <option key={id} value={id}>{label}</option>
          ))}
        </select>
        {gender === 'female' ? (
          <select aria-label="Coverage" value={coverage} onChange={(e) => setCoverage(e.target.value)} className={select}>
            <option value="">Coverage</option>
            <option value="relaxed">Relaxed</option>
            <option value="modest">Modest</option>
          </select>
        ) : (
          <span />
        )}
      </div>
      {error && <p className="mt-2 text-xs text-red-700" role="alert">{error}</p>}
      <button type="submit" className="btn btn-primary mt-3 !min-h-[40px] w-full !py-2 text-sm" disabled={busy}>
        {busy ? 'Finding brands that fit…' : 'Find pieces'}
      </button>
    </form>
  );
}
