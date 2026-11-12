'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import Header from '@/components/Header';
import LookBoard, { type SlotState } from '@/components/LookBoard';
import PieceGrid from '@/components/PieceGrid';
import ShareButtons from '@/components/ShareButtons';
import StudioWelcome from '@/components/StudioWelcome';
import { toast } from '@/components/Toaster';
import { api, rupees } from '@/lib/api';
import { PALETTE_HEX } from '@/lib/palette';
import { SLOT_NAME, slotStates } from '@/lib/lookRules';
import { useRequireUser } from '@/lib/useMe';
import { slotsFor, type Challenge, type Design, type FeedLook, type Gender, type Product, type Slot } from '@/lib/types';

type Tab = 'design' | 'mine';
type Step = 'challenge' | 'loading' | 'build' | 'preview' | 'done';

function Swatches({ colors }: { colors: string[] }) {
  if (!colors.length) return <span className="text-xs text-ink/65">Any colour</span>;
  return (
    <span className="flex items-center gap-1" aria-label={colors.join(', ')}>
      {colors.slice(0, 6).map((c) => (
        <span key={c} className="h-3.5 w-3.5 rounded-full border border-ink/15" style={{ background: PALETTE_HEX[c] }} title={c} />
      ))}
    </span>
  );
}

function ChallengeTags({ c }: { c: Challenge }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink/70">
      <Swatches colors={c.colors} />
      {c.modest && <span>Modest</span>}
      {c.wantsDupatta && <span>Dupatta</span>}
    </div>
  );
}

const OCCASIONS: Array<[string, string]> = [
  ['eid', 'Eid'],
  ['mehndi', 'Mehndi'],
  ['baraat', 'Baraat'],
  ['walima', 'Walima'],
  ['party', 'Party'],
  ['office', 'Office'],
  ['university', 'University'],
  ['casual', 'Everyday'],
];

/** What the half-minute preview wait shows: honest steps and a bar that slows near the end. */
const WAIT_STEPS = ['Choosing your model…', 'Gathering your pieces…', 'Dressing the model…', 'Draping the dupatta…', 'Adding the final touches…'];

function PreviewWait() {
  const [t, setT] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setT((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const done = Math.min(92, Math.round(100 * (1 - Math.exp(-t / 14))));
  return (
    <div className="flex w-full max-w-[260px] flex-col items-center gap-3 text-center" role="status">
      <span className="h-10 w-10 animate-spin rounded-full border-4 border-plum/20 border-t-plum motion-reduce:animate-none" aria-hidden="true" />
      <p className="text-sm font-medium text-ink/80">{WAIT_STEPS[Math.min(WAIT_STEPS.length - 1, Math.floor(t / 7))]}</p>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white" aria-hidden="true">
        <div className="h-full rounded-full bg-plum transition-[width] duration-1000 ease-linear" style={{ width: `${done}%` }} />
      </div>
      <p className="text-xs text-ink/65">Usually about half a minute</p>
    </div>
  );
}

/** A look in progress, kept on this device so a refresh or a closed tab does not lose it. */
type SavedLook = { challengeId: string; look: Partial<Record<Slot, Product>>; active: Slot; at: number };
const WEEK = 7 * 24 * 60 * 60 * 1000;

export default function Studio() {
  const me = useRequireUser();
  const [tab, setTab] = useState<Tab>('design');
  const [error, setError] = useState('');

  /* ------------------------------ design ------------------------------ */
  const [step, setStep] = useState<Step>('challenge');
  const [challenges, setChallenges] = useState<Challenge[] | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [look, setLook] = useState<Partial<Record<Slot, Product>>>({});
  const [active, setActive] = useState<Slot>('main');
  const [busy, setBusy] = useState(false);
  /** Women's or men's challenges: starts on the taste quiz's answer, and anyone can switch. */
  const [side, setSide] = useState<Gender | null>(null);
  const gender: Gender = side ?? me?.gender ?? 'female';
  const SLOTS = slotsFor(challenge?.gender);
  /** Challenge list filter: one occasion, those asked by shoppers, or all */
  const [occasion, setOccasion] = useState<string>('all');
  const ofGender = (challenges ?? []).filter((c) => c.gender === gender);
  const occasionsHere = OCCASIONS.filter(([id]) => ofGender.some((c) => c.occasion === id));
  const shown = ofGender.filter((c) => (occasion === 'asked' ? c.fromShoppers : occasion === 'all' || !occasionsHere.some(([id]) => id === occasion) ? true : c.occasion === occasion));

  // Errors show as a pop-up, so they are seen wherever the page is scrolled.
  useEffect(() => {
    if (error) toast(error, 'error');
  }, [error]);

  const loadChallenges = () =>
    api<{ challenges: Challenge[] }>('/game/challenges')
      .then((r) => setChallenges(r.challenges))
      .catch((e) => setError(e.message));

  useEffect(() => {
    if (me) loadChallenges();
  }, [me]);

  /** Picking a challenge opens the builder straight away, with fitting pieces from every brand. */
  function chooseChallenge(c: Challenge) {
    setError('');
    setChallenge(c);
    setLook({});
    setActive('main');
    setStep('build');
  }

  /* --------------------------- look in progress --------------------------- */
  const saveKey = me ? `saleeqa:studio:${me.user.id}` : null;
  const [resume, setResume] = useState<{ challenge: Challenge; saved: SavedLook } | null>(null);

  const forgetSaved = () => {
    try {
      if (saveKey) localStorage.removeItem(saveKey);
    } catch {
      /* storage blocked: nothing to forget */
    }
    setResume(null);
  };

  // Offer to continue a look left unfinished on this device (within a week).
  useEffect(() => {
    if (!saveKey || !challenges) return;
    try {
      const saved = JSON.parse(localStorage.getItem(saveKey) ?? 'null') as SavedLook | null;
      const c = saved && challenges.find((x) => x.id === saved.challengeId);
      if (saved && c && Date.now() - saved.at < WEEK && Object.values(saved.look).some(Boolean)) setResume({ challenge: c, saved });
    } catch {
      /* nothing saved, or storage blocked */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveKey, challenges === null]);

  // Keep the look as it is built.
  useEffect(() => {
    if (!saveKey || !challenge || (step !== 'build' && step !== 'preview') || !Object.values(look).some(Boolean)) return;
    try {
      localStorage.setItem(saveKey, JSON.stringify({ challengeId: challenge.id, look, active, at: Date.now() } satisfies SavedLook));
    } catch {
      /* storage full or blocked: the look still works, it is just not kept */
    }
  }, [saveKey, challenge, look, active, step]);

  function continueSaved() {
    if (!resume) return;
    setChallenge(resume.challenge);
    setLook(resume.saved.look);
    setActive(resume.saved.active);
    setStep('build');
    setResume(null);
  }

  // "Remix this look" from the Runway: open its challenge with its pieces, ready to change.
  const remixed = useRef(false);
  useEffect(() => {
    if (!challenges || remixed.current) return;
    const params = new URLSearchParams(window.location.search);
    const open = params.get('challenge');
    if (open) {
      remixed.current = true;
      window.history.replaceState(null, '', '/studio');
      const c = challenges.find((x) => x.id === open);
      if (!c) return toast('That challenge is not open any more.', 'error');
      setSide(c.gender);
      chooseChallenge(c);
      setResume(null);
      return;
    }
    const id = params.get('remix');
    if (!id) return;
    remixed.current = true;
    window.history.replaceState(null, '', '/studio');
    api<{ look: FeedLook }>(`/feed/${id}`)
      .then(({ look: l }) => {
        const c = challenges.find((x) => x.id === l.challenge?.id);
        if (!c) return toast('That challenge is not open any more.', 'error');
        setSide(c.gender);
        setChallenge(c);
        setLook(Object.fromEntries(l.items.map((i) => [i.slot, i.product])) as Partial<Record<Slot, Product>>);
        setActive('main');
        setDraft(null);
        setStep('build');
        setResume(null);
        toast(l.mine ? 'Your look is open: change any piece, then publish a new version.' : `Remixing ${l.by}’s look: change any piece, then publish your version.`, 'success');
      })
      .catch((e) => toast(e.message, 'error'));
  }, [challenges]);

  /** The piece grid: brought back into view on phones after a pick moves on to the next piece. */
  const gridRef = useRef<HTMLDivElement>(null);
  const showGrid = () => {
    const el = gridRef.current;
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const states = slotStates(look.main, challenge);
  const total = SLOTS.reduce((n, s) => n + (states[s] === 'included' ? 0 : look[s]?.price ?? 0), 0);
  const missing = SLOTS.filter((s) => states[s] === 'required' && !look[s]);

  function put(slot: Slot, p: Product) {
    const removing = look[slot]?.id === p.id;
    const next: Partial<Record<Slot, Product>> = { ...look, [slot]: removing ? undefined : p };
    // A new outfit may bring its own bottom or dupatta.
    const s = slotStates(next.main, challenge);
    if (s.bottom === 'included') delete next.bottom;
    if (s.dupatta === 'included') delete next.dupatta;
    setLook(next);
    // After choosing a piece, move on to the next one the look still needs (then the optional ones).
    if (!removing) {
      const after = SLOTS.slice(SLOTS.indexOf(slot) + 1).concat(SLOTS.slice(0, SLOTS.indexOf(slot)));
      const needed = after.find((x) => s[x] === 'required' && !next[x]);
      const optional = SLOTS.slice(SLOTS.indexOf(slot) + 1).find((x) => s[x] === 'optional' && !next[x]);
      const go = needed ?? optional;
      if (go) {
        setActive(go);
        requestAnimationFrame(showGrid);
      }
    }
  }

  function removePiece(slot: Slot) {
    setLook((l) => ({ ...l, [slot]: undefined }));
  }

  const itemsBody = () => SLOTS.filter((s) => look[s] && states[s] !== 'included').map((s) => ({ slot: s, productId: look[s]!.id }));

  /* ------------------------------ AI preview ------------------------------ */
  /** Whether the server has the AI preview switched on (a Google Cloud project is set). */
  const [previewOn, setPreviewOn] = useState(false);
  /** The private draft of the finished look, with its preview once it is made */
  const [draft, setDraft] = useState<Design | null>(null);
  const [previewing, setPreviewing] = useState(false);
  /** The look just published, to share and open */
  const [published, setPublished] = useState<Design | null>(null);

  useEffect(() => {
    if (me) api<{ enabled: boolean }>('/game/preview').then((r) => setPreviewOn(r.enabled)).catch(() => setPreviewOn(false));
  }, [me]);

  /** Saves the look as a private draft, then has the AI dress the model in it (about half a minute). */
  async function preview() {
    if (!challenge || missing.length || previewing) return;
    setError('');
    setStep('preview');
    setPreviewing(true);
    try {
      const saved = (await api<{ design: Design }>('/game/designs', { body: { challengeId: challenge.id, items: itemsBody(), draft: true } })).design;
      setDraft(saved);
      setDraft((await api<{ design: Design }>(`/game/designs/${saved.id}/preview`, { method: 'POST' })).design);
    } catch (e) {
      setError((e as Error).message);
    }
    setPreviewing(false);
  }

  /** The same look on the next of our models (a new image). */
  async function anotherModel() {
    if (!draft || previewing) return;
    setError('');
    setPreviewing(true);
    try {
      setDraft((await api<{ design: Design }>(`/game/designs/${draft.id}/preview`, { body: { anotherModel: true } })).design);
    } catch (e) {
      setError((e as Error).message);
    }
    setPreviewing(false);
  }

  /** Back to the builder; the pieces stay as they were. A changed look gets a new preview. */
  function changePieces() {
    setError('');
    setDraft(null);
    setStep('build');
  }

  /** Publishes the previewed draft, or (without a preview) the look straight away, to the Runway. */
  async function publish() {
    if (!challenge || missing.length) return;
    setError('');
    setBusy(true);
    try {
      const r = draft
        ? await api<{ design: Design }>(`/game/designs/${draft.id}/publish`, { method: 'POST' })
        : await api<{ design: Design }>('/game/designs', { body: { challengeId: challenge.id, items: itemsBody() } });
      setPublished(r.design);
      setStep('done');
      forgetSaved();
      loadChallenges();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  const resetDesign = () => {
    // Leaving a look half-built: offer it back at the top of the challenge list.
    if (challenge && step !== 'done' && Object.values(look).some(Boolean)) setResume({ challenge, saved: { challengeId: challenge.id, look, active, at: Date.now() } });
    setStep('challenge');
    setChallenge(null);
    setLook({});
    setDraft(null);
  };

  /* ------------------------------ rate + mine ------------------------------ */
  const [mine, setMine] = useState<Design[] | null>(null);

  useEffect(() => {
    if (!me) return;
    setError('');
    if (tab === 'mine') api<{ designs: Design[] }>('/game/designs/mine').then((r) => setMine(r.designs)).catch((e) => setError(e.message));
  }, [tab, me]);

  const lookOf = (d: Design) => Object.fromEntries(d.items.map((i) => [i.slot, i.product])) as Partial<Record<Slot, Product>>;
  const doneStates = (d: Design): Partial<Record<Slot, SlotState>> => {
    const has = new Set(d.items.map((i) => i.slot));
    return Object.fromEntries(slotsFor(d.challenge?.gender).map((s) => [s, has.has(s) ? 'optional' : 'hidden'])) as Partial<Record<Slot, SlotState>>;
  };

  /** The phone bar shows while building or previewing a look. */
  const bar = tab === 'design' && (step === 'build' || step === 'preview');

  if (!me) return <Header />;

  return (
    <>
      <Header />
      <main className={`page py-6 sm:py-8 ${bar ? 'pb-28 md:pb-8' : ''}`}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Studio</p>
            <h1 className="mt-1 text-3xl font-semibold sm:text-4xl">Style the look</h1>
            <p className="mt-1 max-w-xl text-sm text-ink/70">
              Pick a challenge, put a complete look together from Pakistan’s favourite brands.
              Publish it to the Runway, where everyone can like it and comment.
            </p>
          </div>
          <div className="flex gap-1 rounded-full border border-line bg-white p-1 text-sm" role="tablist">
            {(['design', 'mine'] as Tab[]).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`rounded-full px-4 py-2 ${tab === t ? 'bg-plum text-white' : 'text-ink/70 hover:bg-sand'}`}
              >
                {t === 'design' ? 'Design' : 'My designs'}
              </button>
            ))}
          </div>
        </div>

        {tab === 'design' && (
          <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
            {/* ------------------------------- sidebar ------------------------------- */}
            <aside className="card h-fit min-w-0 lg:sticky lg:top-24">
              {step === 'challenge' && (
                <>
                  <h2 className="font-semibold">1 · What do you want to design?</h2>
                  <div className="mt-3 grid grid-cols-2 gap-1 rounded-full border border-line bg-ivory p-1 text-sm" role="tablist" aria-label="Women's or men's looks">
                    {(['female', 'male'] as Gender[]).map((g) => (
                      <button
                        key={g}
                        type="button"
                        role="tab"
                        aria-selected={gender === g}
                        onClick={() => setSide(g)}
                        className={`min-h-[40px] rounded-full px-3 font-medium transition-colors ${gender === g ? 'bg-plum text-white' : 'text-ink/70 hover:bg-sand'}`}
                      >
                        {g === 'female' ? 'Women' : 'Men'}
                      </button>
                    ))}
                  </div>
                  {resume && (
                    <div className="mt-3 rounded-2xl border border-gold/50 bg-ivory p-3">
                      <p className="text-sm font-semibold">Continue your look?</p>
                      <p className="mt-0.5 text-xs text-ink/70">
                        {resume.challenge.title} · {Object.values(resume.saved.look).filter(Boolean).length} piece{Object.values(resume.saved.look).filter(Boolean).length === 1 ? '' : 's'} chosen
                      </p>
                      <div className="mt-2 flex gap-2">
                        <button type="button" className="btn btn-primary !min-h-[36px] !px-4 !py-1.5 text-sm" onClick={continueSaved}>Continue</button>
                        <button type="button" className="btn btn-ghost !min-h-[36px] !px-4 !py-1.5 text-sm" onClick={forgetSaved}>Start fresh</button>
                      </div>
                    </div>
                  )}
                  {challenges && occasionsHere.length > 1 && (
                    <div className="no-scrollbar -mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Occasion">
                      {[['all', 'All'] as [string, string], ...occasionsHere, ...(ofGender.some((c) => c.fromShoppers) ? [['asked', 'Asked by shoppers'] as [string, string]] : [])].map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          role="tab"
                          aria-selected={occasion === id}
                          onClick={() => setOccasion(id)}
                          className={`min-h-[40px] shrink-0 rounded-full border px-3.5 text-sm font-medium transition-colors ${occasion === id ? 'border-plum bg-plum text-white' : 'border-line bg-white text-ink/75 hover:border-gold'}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                  {!challenges ? (
                    <ul className="mt-3 space-y-2" aria-label="Loading challenges">
                      {Array.from({ length: 4 }, (_, k) => (
                        <li key={k} className="flex gap-3 rounded-2xl border border-line p-3">
                          <div className="h-[72px] w-14 shrink-0 animate-pulse rounded-xl bg-sand" />
                          <div className="flex-1 space-y-2 pt-1">
                            <div className="h-3.5 w-4/5 animate-pulse rounded bg-sand" />
                            <div className="h-3 w-1/2 animate-pulse rounded bg-sand" />
                            <div className="h-3 w-1/3 animate-pulse rounded bg-sand" />
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <ul className="mt-3 max-h-[60vh] space-y-2 overflow-y-auto pr-1">
                      {shown.map((c) => (
                        <li key={c.id}>
                          <button onClick={() => chooseChallenge(c)} className="flex w-full gap-3 rounded-2xl border border-line p-3 text-left transition-colors hover:border-gold hover:bg-ivory">
                            {c.cover ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={c.cover} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-[72px] w-14 shrink-0 rounded-xl bg-sand object-cover object-top" />
                            ) : (
                              <span className="h-[72px] w-14 shrink-0 rounded-xl bg-sand" aria-hidden="true" />
                            )}
                            <span className="block min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-sm font-semibold">{c.title}</span>
                              {c.featured ? (
                                <span className="shrink-0 rounded-full bg-gold px-2 py-0.5 text-[11px] font-semibold text-ink">★ This week</span>
                              ) : (
                                c.fromShoppers && <span className="shrink-0 rounded-full bg-plum-soft px-2 py-0.5 text-[11px] font-semibold text-plum-dark">asked by shoppers</span>
                              )}
                            </div>
                            <ChallengeTags c={c} />
                            <div className="mt-1 text-[11px] text-ink/65">{c.designs ? `${c.designs} design${c.designs === 1 ? '' : 's'} so far` : 'Be the first to style it'}</div>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}

              {step !== 'challenge' && challenge && (
                <div className="mb-4 border-b border-line pb-4">
                  <button onClick={resetDesign} className="text-xs text-plum underline-offset-2 hover:underline">← All challenges</button>
                  <h2 className="mt-1 font-semibold">{challenge.title}</h2>
                  <ChallengeTags c={challenge} />
                </div>
              )}

              {step === 'loading' && <p className="text-sm text-ink/65">Opening the wardrobe…</p>}

              {step === 'build' && (
                <>
                  <h2 className="font-semibold">2 · Build your look</h2>
                  <ul className="mt-3 space-y-1.5">
                    {SLOTS.map((s) => {
                      const p = look[s];
                      const st = states[s];
                      return (
                        <li key={s} className="relative">
                          <button
                            disabled={st === 'included'}
                            onClick={() => setActive(s)}
                            className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left text-sm transition-colors ${p && st !== 'included' ? 'pr-11' : ''} ${active === s ? 'border-plum bg-plum-soft' : 'border-line hover:border-gold'} disabled:cursor-default disabled:hover:border-line`}
                          >
                            {p?.images?.[0] && st !== 'included' ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={p.images[0]} alt="" referrerPolicy="no-referrer" className="h-9 w-9 shrink-0 rounded-lg object-cover object-top" style={{ background: p.hex }} />
                            ) : (
                              <span className="h-9 w-9 shrink-0 rounded-lg border border-ink/10" style={{ background: p?.hex ?? 'transparent', borderStyle: p ? 'solid' : 'dashed' }} />
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="block font-medium">{SLOT_NAME[s]}</span>
                              <span className="block truncate text-xs text-ink/65">
                                {st === 'included' ? 'Comes with your outfit' : p ? `${p.brandName} · ${rupees(p.price)}` : st === 'required' ? 'Needed' : 'Optional'}
                              </span>
                            </span>
                            {st === 'required' && !p && <span className="h-2 w-2 rounded-full bg-plum" aria-label="needed" />}
                          </button>
                          {p && st !== 'included' && (
                            <button
                              type="button"
                              onClick={() => removePiece(s)}
                              aria-label={`Remove ${SLOT_NAME[s].toLowerCase()}`}
                              title="Remove"
                              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-lg leading-none text-ink/65 hover:bg-white hover:text-red-700"
                            >
                              ×
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {/* No budget in the game; the total is kept so looks can be matched to shoppers' budgets later. */}
                  <div className="mt-4 flex justify-between text-sm">
                    <span>Look total</span>
                    <span className="font-semibold">{rupees(total)}</span>
                  </div>
                  {missing.length > 0 ? (
                    <button className="btn btn-primary mt-5 w-full" disabled>
                      Add {missing.map((s) => SLOT_NAME[s].toLowerCase()).join(', ')}
                    </button>
                  ) : previewOn ? (
                    <>
                      <button className="btn btn-primary mt-5 w-full" onClick={preview}>✨ Preview on model</button>
                      <p className="mt-2 text-center text-xs text-ink/65">See your look on a model before it goes on the Runway.</p>
                      <button className="mt-2 w-full text-center text-xs text-plum underline-offset-2 hover:underline disabled:opacity-50" disabled={busy} onClick={publish}>
                        {busy ? 'Publishing…' : 'or publish without a preview'}
                      </button>
                    </>
                  ) : (
                    <button className="btn btn-primary mt-5 w-full" disabled={busy} onClick={publish}>
                      {busy ? 'Publishing…' : 'Publish my look'}
                    </button>
                  )}
                </>
              )}

              {step === 'preview' && (
                <>
                  <h2 className="font-semibold">3 · Preview on model</h2>
                  {previewing ? (
                    <p className="mt-2 text-sm text-ink/70">Dressing the model in your look. This takes about half a minute…</p>
                  ) : draft?.previewUrl ? (
                    <p className="mt-2 text-sm text-ink/70">Happy with it? Publish it to the Runway, or go back and change any piece.</p>
                  ) : (
                    <p className="mt-2 text-sm text-ink/70">The preview didn’t work this time. Try again, or publish your look without it.</p>
                  )}
                  <div className="mt-4 flex justify-between text-sm">
                    <span>Look total</span>
                    <span className="font-semibold">{rupees(total)}</span>
                  </div>
                  <div className="mt-5 flex flex-col gap-2">
                    {!previewing && !draft?.previewUrl && (
                      <button className="btn btn-ghost w-full" onClick={preview}>Try the preview again</button>
                    )}
                    <button className="btn btn-primary w-full" disabled={busy || previewing} onClick={publish}>
                      {busy ? 'Publishing…' : 'Publish to the Runway'}
                    </button>
                    {draft?.previewUrl && (
                      <button className="btn btn-ghost w-full" disabled={busy || previewing} onClick={anotherModel}>Try another model</button>
                    )}
                    <button className="btn btn-ghost w-full" disabled={busy || previewing} onClick={changePieces}>Change pieces</button>
                  </div>
                </>
              )}

              {step === 'done' && (
                <div className="text-center">
                  <p className="text-3xl" aria-hidden="true">✨</p>
                  <h2 className="mt-2 font-semibold">Your look is live!</h2>
                  <p className="mt-1 text-sm text-ink/70">It’s on the Runway now, where everyone can like it and comment.</p>
                  {published && (
                    <div className="mt-4 rounded-2xl bg-ivory p-3">
                      <p className="mb-2 text-sm font-semibold">Ask your friends what they think</p>
                      <div className="flex justify-center">
                        <ShareButtons lookId={published.id} compact text={`I styled this ${challenge?.title ?? 'look'} on Saleeqa. What do you think?`} />
                      </div>
                    </div>
                  )}
                  <div className="mt-4 flex flex-col gap-2">
                    <Link className="btn btn-primary" href={published ? `/runway/${published.id}` : '/runway'}>See it on the Runway</Link>
                    <button className="btn btn-ghost" onClick={resetDesign}>Design another</button>
                  </div>
                </div>
              )}
            </aside>

            {/* ------------------------------- stage ------------------------------- */}
            {/* While building on a phone, the board comes before the sidebar's slot list. */}
            <section className={`min-w-0 ${step === 'build' || step === 'preview' || step === 'done' ? 'order-first lg:order-none' : ''}`}>
              {step === 'preview' ? (
                <div className="grid gap-6 md:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
                  <figure className="mx-auto w-full max-w-[420px]">
                    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-3xl border border-line bg-sand">
                      {draft?.previewUrl && !previewing ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={draft.previewUrl} alt="Your look on a model (AI preview)" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center">
                          {previewing ? (
                            <PreviewWait />
                          ) : (
                            <p className="text-sm text-ink/65">No preview yet</p>
                          )}
                        </div>
                      )}
                      {draft?.previewUrl && !previewing && (
                        <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-plum-dark">AI preview</span>
                      )}
                    </div>
                    <figcaption className="mt-2 text-center text-xs text-ink/65">An AI image: small details may differ from the real pieces.</figcaption>
                  </figure>
                  <div>
                    <h3 className="font-semibold">Your pieces</h3>
                    <LookBoard pieces={look} states={states} gender={challenge?.gender} compact className="mt-3 w-full max-w-[300px]" />
                  </div>
                </div>
              ) : step === 'build' || step === 'done' ? (
                <div className="grid gap-6 md:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
                  <div className="min-w-0 md:sticky md:top-24 md:h-fit">
                    <LookBoard
                      pieces={look}
                      states={states}
                      active={step === 'build' ? active : null}
                      onSlot={step === 'build' ? (s) => states[s] !== 'included' && setActive(s) : undefined}
                      gender={challenge?.gender}
                      className="mx-auto w-full max-w-[360px]"
                    />
                    <p className="mt-2 text-center text-xs text-ink/65">{step === 'build' ? 'Tap any card to choose that piece' : 'Your published look'}</p>
                  </div>
                  {step === 'build' && (
                    <div className="min-w-0">
                      {/* On phones the sidebar is far above; this row switches pieces without scrolling back. */}
                      <div className="no-scrollbar sticky top-[65px] z-10 -mx-4 mb-3 flex gap-2 overflow-x-auto bg-ivory/95 px-4 py-2 backdrop-blur md:hidden">
                        {SLOTS.filter((s) => states[s] !== 'included').map((s) => (
                          <button key={s} onClick={() => setActive(s)} className={`chip shrink-0 !min-h-[40px] !py-1.5 ${active === s ? 'chip-on' : ''}`}>
                            {look[s] ? '✓ ' : states[s] === 'required' ? '• ' : ''}
                            {SLOT_NAME[s]}
                          </button>
                        ))}
                      </div>
                      <div ref={gridRef} className="scroll-mt-28">
                        <h3 className="mb-2 font-semibold">{SLOT_NAME[active]}</h3>
                        {states[active] === 'included' ? (
                          <p className="text-sm text-ink/70">Your outfit already comes with this.</p>
                        ) : (
                          challenge && (
                            <PieceGrid
                              key={`${challenge.id}-${active}`}
                              challengeId={challenge.id}
                              slot={active}
                              selected={look[active]}
                              onPick={(p) => put(active, p)}
                              onRemove={() => removePiece(active)}
                            />
                          )
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <StudioWelcome />
              )}
            </section>
          </div>
        )}

        {tab === 'mine' && (
          <div className="mt-6">
            {!mine ? (
              <p className="text-sm text-ink/65">Loading…</p>
            ) : mine.length === 0 ? (
              <div className="card py-10 text-center">
                <h2 className="font-semibold">No designs yet</h2>
                <button className="btn btn-primary mt-4" onClick={() => setTab('design')}>Design your first look</button>
              </div>
            ) : (
              <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {mine.map((d) => (
                  <li key={d.id}>
                  <Link href={`/runway/${d.id}`} className="card block h-full transition hover:border-gold">
                    {d.previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={d.previewUrl} alt="Your look on a model (AI preview)" loading="lazy" className="aspect-[3/4] w-full rounded-2xl object-cover" />
                    ) : (
                      <LookBoard
                        pieces={lookOf(d)}
                        states={doneStates(d)}
                        gender={d.challenge?.gender}
                        compact
                        className="mx-auto w-full"
                      />
                    )}
                    <h3 className="mt-2 line-clamp-2 text-sm font-semibold">{d.challenge?.title ?? 'Challenge'}</h3>
                    <div className="mt-1 flex items-center justify-between text-xs text-ink/70">
                      <span>{rupees(d.total)}</span>
                      <span className="font-semibold text-plum">♥ {d.up}</span>
                    </div>
                  </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </main>

      {/* Phones: the look's total and its next step always within thumb's reach. */}
      {bar && (
        <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-30 border-t border-line bg-white/95 px-4 pb-3 pt-3 shadow-[0_-6px_20px_rgba(0,0,0,0.06)] backdrop-blur sm:bottom-0 sm:pb-[max(12px,env(safe-area-inset-bottom))] md:hidden">
          <div className="mx-auto flex max-w-xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] uppercase tracking-wide text-ink/65">Look total</div>
              <div className="truncate font-semibold">
                {rupees(total)}
                {step === 'build' && missing.length > 0 && <span className="ml-2 text-xs font-normal text-plum">{missing.length} more needed</span>}
              </div>
            </div>
            {step === 'build' ? (
              missing.length > 0 ? (
                <button
                  className="btn btn-primary !min-h-[44px] shrink-0"
                  onClick={() => {
                    setActive(missing[0]);
                    requestAnimationFrame(showGrid);
                  }}
                >
                  Add {SLOT_NAME[missing[0]].toLowerCase()}
                </button>
              ) : previewOn ? (
                <button className="btn btn-primary !min-h-[44px] shrink-0" onClick={preview}>✨ Preview</button>
              ) : (
                <button className="btn btn-primary !min-h-[44px] shrink-0" disabled={busy} onClick={publish}>{busy ? 'Publishing…' : 'Publish'}</button>
              )
            ) : (
              <button className="btn btn-primary !min-h-[44px] shrink-0" disabled={busy || previewing} onClick={publish}>
                {busy ? 'Publishing…' : previewing ? 'Dressing…' : 'Publish'}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
