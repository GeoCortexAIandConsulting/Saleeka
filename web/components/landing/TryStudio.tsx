'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import LookBoard from '@/components/LookBoard';
import { SLOT_NAME, slotStates } from '@/lib/lookRules';
import { slotsFor, type Challenge, type Gender, type Product, type Slot } from '@/lib/types';

/**
 * A playable mini Studio on the landing page, with real pieces from the catalogue: a women's Mehndi
 * or a men's Eid challenge and a few pieces per slot (GET /api/demo/look, open to everyone). It follows the
 * Studio's rules and uses its look board, so visitors see exactly what they will get, and every
 * chosen piece links to the brand's shop. "Publish" invites them to sign up to do it for real.
 */

type Items = Partial<Record<Slot, Product[]>>;

const NAMES: Record<Slot, string> = { ...SLOT_NAME, dupatta: 'Dupatta' };
const rupees = (n: number) => `Rs. ${n.toLocaleString('en-PK')}`;
/** The colours shown on each side's challenge card */
const SWATCHES: Record<Gender, string[]> = { female: ['#D4A017', '#F2D34C', '#E2C07A'], male: ['#FFFFFF', '#F6EFE0', '#D9C3A0'] };

export default function TryStudio() {
  const [gender, setGender] = useState<Gender>('female');
  const [data, setData] = useState<{ challenge: Challenge; items: Items } | null>(null);
  const [failed, setFailed] = useState(false);
  const [look, setLook] = useState<Partial<Record<Slot, Product>>>({});
  const [active, setActive] = useState<Slot>('main');
  const [published, setPublished] = useState(false);

  useEffect(() => {
    setData(null);
    setFailed(false);
    fetch(`/api/demo/look?gender=${gender}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setData)
      .catch(() => setFailed(true));
  }, [gender]);

  const challenge = data?.challenge ?? null;
  const SLOTS = slotsFor(gender);
  const states = slotStates(look.main, challenge ?? { gender, wantsDupatta: false });
  const shown = SLOTS.filter((s) => states[s] !== 'included');
  const chosen = shown.filter((s) => look[s]);
  const total = chosen.reduce((n, s) => n + look[s]!.price, 0);
  const missing = shown.filter((s) => states[s] === 'required' && !look[s]);
  const brands = data ? [...new Set(SLOTS.flatMap((s) => (data.items[s] ?? []).map((p) => p.brandName)))] : [];

  function pick(slot: Slot, p: Product) {
    const removing = look[slot]?.id === p.id;
    const next: Partial<Record<Slot, Product>> = { ...look, [slot]: removing ? undefined : p };
    // A suit that brings its own bottom or dupatta takes the place of the separate one.
    const s = slotStates(next.main, challenge);
    if (s.bottom === 'included') delete next.bottom;
    if (s.dupatta === 'included') delete next.dupatta;
    setLook(next);
    if (removing) return;
    // Like the Studio: move on to the next piece the look still needs, then the optional ones.
    const i = SLOTS.indexOf(slot);
    const after = [...SLOTS.slice(i + 1), ...SLOTS.slice(0, i)];
    const go = after.find((x) => s[x] === 'required' && !next[x]) ?? SLOTS.slice(i + 1).find((x) => s[x] === 'optional' && !next[x]);
    if (go) setActive(go);
  }

  const reset = () => {
    setLook({});
    setActive('main');
    setPublished(false);
  };

  function switchTo(g: Gender) {
    if (g === gender) return;
    reset();
    setGender(g);
  }

  const sides = (
    <div className="mx-auto mb-5 grid w-full max-w-xs grid-cols-2 gap-1 rounded-full border border-line bg-white p-1 text-sm" role="tablist" aria-label="Style a women's or a men's look">
      {(['female', 'male'] as Gender[]).map((g) => (
        <button
          key={g}
          type="button"
          role="tab"
          aria-selected={gender === g}
          onClick={() => switchTo(g)}
          className={`min-h-[44px] rounded-full px-4 font-semibold transition-colors ${gender === g ? 'bg-plum text-white' : 'text-ink/70 hover:bg-sand'}`}
        >
          {g === 'female' ? 'Style for her' : 'Style for him'}
        </button>
      ))}
    </div>
  );

  if (failed) {
    return (
      <>
      {sides}
      <div className="rounded-[2rem] border border-line bg-white p-10 text-center">
        <p className="font-display text-2xl font-semibold">The wardrobe is being restocked.</p>
        <p className="mt-2 text-ink/70">Sign up to style real pieces in the Studio.</p>
        <Link href="/signup" className="btn btn-primary mt-6">Start styling, it’s free</Link>
      </div>
      </>
    );
  }

  const options = data?.items[active] ?? [];

  return (
    <>
    {sides}
    <div className="grid grid-cols-[minmax(0,1fr)] overflow-hidden rounded-[2rem] border border-line bg-white shadow-[0_40px_80px_-50px_rgb(79_31_68_/_0.45)] lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      {/* ------------------------------- the board ------------------------------- */}
      <div className="relative flex min-w-0 flex-col items-center bg-gradient-to-b from-sand to-[#F7EFE4] px-5 pb-6 pt-7 sm:px-8">
        <LookBoard
          pieces={look}
          states={states}
          active={published ? null : active}
          onSlot={published ? undefined : (s) => states[s] !== 'included' && setActive(s)}
          gender={gender}
          className="w-full max-w-[340px] shadow-[0_30px_50px_-35px_rgb(79_31_68_/_0.5)]"
          label={gender === 'male' ? 'Your Eid look' : 'Your Mehndi look'}
        />

        <div className="mt-5 w-full max-w-[340px]">
          <div className="flex items-baseline justify-between">
            <span className="text-xs uppercase tracking-[0.2em] text-ink/65">Look total</span>
            <span key={total} className="pop font-display text-3xl font-semibold text-plum-dark" aria-live="polite">{rupees(total)}</span>
          </div>
          {chosen.length > 0 ? (
            <ul className="mt-3 space-y-1.5 text-sm">
              {chosen.map((s) => {
                const p = look[s]!;
                return (
                  <li key={s} className="flex items-baseline justify-between gap-3">
                    <a href={`/api/go/${p.id}`} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate underline-offset-2 hover:text-plum hover:underline">
                      <span className="font-semibold">{p.brandName}</span> <span className="text-ink/70">{p.title}</span>
                    </a>
                    <span className="shrink-0 text-xs text-ink/65">{rupees(p.price)}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-ink/65">Tap a piece on the right to start.</p>
          )}
        </div>

        {published && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-night/85 px-8 text-center text-white backdrop-blur-sm" role="status">
            <div className="burst" aria-hidden="true">
              {Array.from({ length: 12 }, (_, i) => <span key={i} style={{ '--a': `${i * 30}deg` } as React.CSSProperties} />)}
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold-light">Runway ready</p>
            <h3 className="mt-2 text-4xl font-semibold leading-tight">That’s a look.</h3>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-white/80">
              {rupees(total)} of real pieces from {[...new Set(chosen.map((s) => look[s]!.brandName))].join(', ')}. Make a free
              account to publish it on the Runway for everyone to see.
            </p>
            <Link href="/signup" className="btn btn-light mt-6">Create my free account</Link>
            <button type="button" onClick={reset} className="mt-3 min-h-[44px] text-sm text-white/70 underline-offset-4 hover:text-white hover:underline">
              Style another
            </button>
          </div>
        )}
      </div>

      {/* ------------------------------- the rail ------------------------------- */}
      <div className="flex min-w-0 flex-col p-5 sm:p-8">
        <div className="rounded-2xl border border-gold-light/60 bg-ivory px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold-deep">Today’s challenge</p>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <p className="font-display text-2xl font-semibold">{challenge?.title ?? (gender === 'male' ? 'Eid' : 'Mehndi')}</p>
            <span className="flex items-center gap-1" aria-hidden="true">
              {SWATCHES[gender].map((c) => <span key={c} className="h-4 w-4 rounded-full border border-ink/10" style={{ background: c }} />)}
            </span>
          </div>
          <p className="text-xs text-ink/65">
            {gender === 'male' ? 'Waistcoat and an accessory are optional' : `${challenge?.wantsDupatta ? 'With a dupatta' : 'Dupatta optional'}${challenge?.modest ? ' · modest' : ''}`}
          </p>
        </div>

        <div className="no-scrollbar -mx-5 mt-5 flex gap-2 overflow-x-auto px-5 sm:-mx-8 sm:px-8" role="tablist" aria-label="Pieces">
          {SLOTS.map((s) => {
            const st = states[s];
            return (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={active === s}
                disabled={st === 'included' || published}
                onClick={() => setActive(s)}
                className={`chip shrink-0 disabled:cursor-default disabled:opacity-50 ${active === s ? 'chip-on' : ''}`}
              >
                {look[s] ? '✓ ' : st === 'required' ? '• ' : ''}
                {NAMES[s]}
                {st === 'included' && <span className="ml-1 text-[11px]">(with outfit)</span>}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex items-baseline justify-between">
          <h3 className="font-display text-xl font-semibold">Choose the {NAMES[active].toLowerCase()}</h3>
          <span className="text-xs text-ink/65">{states[active] === 'required' ? 'Needed' : 'Optional'}</span>
        </div>

        <div role="tabpanel" aria-label={`Choose the ${NAMES[active].toLowerCase()}`}>
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {!data
            ? Array.from({ length: 4 }, (_, i) => (
                <li key={i} className="animate-pulse overflow-hidden rounded-2xl border border-line motion-reduce:animate-none">
                  <div className="aspect-[3/4] bg-sand" />
                  <div className="space-y-1.5 p-2.5">
                    <div className="h-3 rounded bg-sand" />
                    <div className="h-3 w-2/3 rounded bg-sand" />
                  </div>
                </li>
              ))
            : options.map((p) => {
                const on = look[active]?.id === p.id;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => pick(active, p)}
                      aria-pressed={on}
                      disabled={published}
                      className={`w-full overflow-hidden rounded-2xl border bg-white text-left transition duration-300 ${on ? 'border-plum ring-2 ring-plum' : 'border-line hover:-translate-y-0.5 hover:border-gold'}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.images![0]}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className={`aspect-[3/4] w-full ${['main', 'bottom', 'dupatta', 'waistcoat'].includes(active) ? 'object-cover object-top' : 'object-contain p-2'}`}
                        style={{ background: p.hex }}
                      />
                      <div className="p-2.5">
                        <div className="line-clamp-2 text-xs font-medium capitalize leading-snug">{p.title}</div>
                        <div className="mt-0.5 truncate text-[11px] text-ink/65">{p.brandName}</div>
                        <div className="mt-1 flex items-center justify-between text-xs">
                          <span className="font-semibold">{rupees(p.price)}</span>
                          {active === 'main' && p.includesBottom && <span className="text-[11px] text-ink/65">{p.includesDupatta ? '3-piece' : 'with bottom'}</span>}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
        </ul>
        </div>

        <div className="mt-auto pt-6">
          <button type="button" className="btn btn-primary w-full !py-4 text-base" disabled={!data || missing.length > 0 || published} onClick={() => setPublished(true)}>
            {missing.length ? `Add ${missing.map((s) => NAMES[s].toLowerCase()).join(', ')}` : 'Publish to the Runway ✦'}
          </button>
          <p className="mt-3 text-center text-xs text-ink/65">
            Real pieces{brands.length ? ` from ${brands.slice(0, 4).join(', ')}${brands.length > 4 ? ' and more' : ''}` : ''}. Prices are the brands’ own and may change.
          </p>
        </div>
      </div>
    </div>
    </>
  );
}
