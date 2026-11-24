'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import Header from '@/components/Header';
import LookBoard, { type SlotState } from '@/components/LookBoard';
import PieceGrid from '@/components/PieceGrid';
import LaunchBanner from '@/components/LaunchBanner';
import LookLive from '@/components/LookLive';
import ShareButtons from '@/components/ShareButtons';
import { shareMessage } from '@/lib/shareText';
import StudioBrief from '@/components/StudioBrief';
import StudioWelcome from '@/components/StudioWelcome';
import { toast } from '@/components/Toaster';
import { api, rupees } from '@/lib/api';
import { PALETTE_HEX } from '@/lib/palette';
import { SLOT_NAME, slotStates } from '@/lib/lookRules';
import { useMaybeUser } from '@/lib/useMe';
import { GUEST_LOOK_KEY, lookKey, LOOK_KEPT_FOR } from '@/lib/savedLook';
import { EMAIL_VERIFIED, resendConfirmation } from '@/lib/verifyEmail';
import { useRouter } from 'next/navigation';
import { lookFromItems, maxPieces, slotsFor, type PreviewStatus, type Challenge, type Design, type FeedLook, type Gender, type Product, type Slot, type StudioLook } from '@/lib/types';
import { photo } from '@/lib/photo';

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

/** The launch prize, e.g. "Top-voted look wins a PKR 10,000 voucher". */
function PrizeLine({ text }: { text: string }) {
  return (
    <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-plum-dark">
      <span aria-hidden="true">🏆</span>
      {text}
    </p>
  );
}

function ChallengeTags({ c }: { c: Challenge }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink/70">
      <Swatches colors={c.colors} />
      {c.modest && <span>Modest</span>}
      {c.wantsDupatta && <span>Dupatta</span>}
      {c.season && <span>{c.season === 'winter' ? 'Winter pieces only' : 'Summer pieces only'}</span>}
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

/** The preview button: "(2 free)" before the first preview, then "(1 left)". Guests see the free count. */
function previewLabel(status: PreviewStatus | null, free: number | null) {
  if (status) return `See it on a model (${status.left} ${status.used === 0 ? 'free' : 'left'})`;
  return free ? `See it on a model (${free} free)` : 'See it on a model';
}

/** A look in progress, kept on this device so a refresh or a closed tab does not lose it. */
type SavedLook = { challengeId: string; look: StudioLook; active: Slot; at: number };
/** Looks saved before a slot could hold several pieces kept one piece per slot. */
const asStudioLook = (look: Partial<Record<Slot, Product | Product[]>>): StudioLook =>
  Object.fromEntries(Object.entries(look).filter(([, v]) => v).map(([k, v]) => [k, Array.isArray(v) ? v : [v]])) as StudioLook;
/** How many pieces a look has in a slot. */
const countIn = (look: StudioLook, s: Slot) => look[s]?.length ?? 0;
const WEEK = LOOK_KEPT_FOR;
/** A guest's look in progress; it moves to their account when they sign up. */
const GUEST_KEY = GUEST_LOOK_KEY;
/** Where sign-up sends a guest back to: the Studio, straight into their look. */
const BACK_TO_LOOK = `?next=${encodeURIComponent('/studio?continue=1')}`;

export default function Studio() {
  // Guests can build a look; an account is asked for only to preview or publish it.
  const { me, ready } = useMaybeUser();
  const router = useRouter();
  // The Studio needs an account (sign up first, then confirm the email once).
  useEffect(() => {
    if (ready && !me) router.replace(`/login?next=${encodeURIComponent('/studio')}`);
  }, [ready, me, router]);
  const [tab, setTab] = useState<Tab>('design');
  const [error, setError] = useState('');

  /* ------------------------------ design ------------------------------ */
  const [step, setStep] = useState<Step>('challenge');
  const [challenges, setChallenges] = useState<Challenge[] | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [look, setLook] = useState<StudioLook>({});
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
    if (ready) loadChallenges();
  }, [ready]);

  /** A challenge by id: from the list, or (a player's own brief, never listed) from the server. */
  const findChallenge = async (id: string): Promise<Challenge | null> =>
    challenges?.find((x) => x.id === id) ??
    (await api<{ challenge: Challenge }>(`/game/challenges/${encodeURIComponent(id)}`)
      .then((r) => r.challenge)
      .catch(() => null));

  /** Picking a challenge opens the builder straight away, with fitting pieces from every brand. */
  function chooseChallenge(c: Challenge) {
    setError('');
    setChallenge(c);
    setLook({});
    setActive('main');
    setStep('build');
  }

  /* --------------------------- look in progress --------------------------- */
  const saveKey = !ready ? null : me ? lookKey(me.user.id) : GUEST_KEY;
  const [resume, setResume] = useState<{ challenge: Challenge; saved: SavedLook } | null>(null);

  const forgetSaved = () => {
    try {
      if (saveKey) localStorage.removeItem(saveKey);
    } catch {
      /* storage blocked: nothing to forget */
    }
    setResume(null);
  };

  // Offer to continue a look left unfinished on this device (within a week). A look built as a guest
  // becomes the new account's look; coming back from sign-up (?continue=1) opens it straight away.
  useEffect(() => {
    if (!saveKey || !challenges) return;
    const read = (key: string) => {
      try {
        return JSON.parse(localStorage.getItem(key) ?? 'null') as SavedLook | null;
      } catch {
        return null; /* nothing saved, or storage blocked */
      }
    };
    let saved = read(saveKey);
    if (me) {
      const guest = read(GUEST_KEY);
      if (guest && (!saved || guest.at > saved.at)) {
        saved = guest;
        try {
          localStorage.setItem(saveKey, JSON.stringify(guest));
        } catch { /* kept in memory only */ }
      }
      try {
        localStorage.removeItem(GUEST_KEY);
      } catch { /* storage blocked */ }
    }
    const params = new URLSearchParams(window.location.search);
    const back = params.get('continue') === '1';
    if (back) window.history.replaceState(null, '', '/studio');
    if (!saved || Date.now() - saved.at >= WEEK || !Object.values(saved.look).some(Boolean)) return;
    const kept = saved;
    findChallenge(kept.challengeId).then((c) => {
      if (!c) return;
      if (!back) return setResume((r) => r ?? { challenge: c, saved: kept });
      setSide(c.gender);
      setChallenge(c);
      setLook(asStudioLook(kept.look));
      setActive(kept.active);
      setStep('build');
      toast('Welcome! Your look is right here: preview it or publish it.', 'success');
    });
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
    setLook(asStudioLook(resume.saved.look));
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
      findChallenge(open).then((c) => {
        if (!c) return toast('That challenge is not open any more.', 'error');
        setSide(c.gender);
        chooseChallenge(c);
        setResume(null);
      });
      return;
    }
    const id = params.get('remix');
    if (!id) return;
    remixed.current = true;
    window.history.replaceState(null, '', '/studio');
    api<{ look: FeedLook }>(`/feed/${id}`)
      .then(async ({ look: l }) => {
        const c = l.challenge?.id ? await findChallenge(l.challenge.id) : null;
        if (!c) return toast('That challenge is not open any more.', 'error');
        setSide(c.gender);
        setChallenge(c);
        setLook(lookFromItems(l.items));
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

  const states = slotStates(look.main?.[0], challenge);
  const total = SLOTS.reduce((n, s) => n + (states[s] === 'included' ? 0 : (look[s] ?? []).reduce((m, p) => m + p.price, 0)), 0);
  const missing = SLOTS.filter((s) => states[s] === 'required' && !countIn(look, s));

  /**
   * Choosing a piece: in most slots it replaces the one there; jewellery and accessories collect up
   * to three. Choosing a chosen piece again takes it out.
   */
  function put(slot: Slot, p: Product) {
    const have = look[slot] ?? [];
    const max = maxPieces(slot);
    const removing = have.some((x) => x.id === p.id);
    if (!removing && max > 1 && have.length >= max) {
      toast(`Up to ${max} ${SLOT_NAME[slot].toLowerCase()}: remove one to add another.`, 'error');
      return;
    }
    const now = removing ? have.filter((x) => x.id !== p.id) : max > 1 ? [...have, p] : [p];
    const next: StudioLook = { ...look, [slot]: now.length ? now : undefined };
    // A new outfit may bring its own bottom or dupatta.
    const s = slotStates(next.main?.[0], challenge);
    if (s.bottom === 'included') delete next.bottom;
    if (s.dupatta === 'included') delete next.dupatta;
    setLook(next);
    // After choosing a piece, move on to the next one the look still needs (then the optional ones).
    // A slot that holds several stays open until it is full.
    if (!removing && now.length >= max) {
      const after = SLOTS.slice(SLOTS.indexOf(slot) + 1).concat(SLOTS.slice(0, SLOTS.indexOf(slot)));
      const needed = after.find((x) => s[x] === 'required' && !countIn(next, x));
      const optional = SLOTS.slice(SLOTS.indexOf(slot) + 1).find((x) => s[x] === 'optional' && !countIn(next, x));
      const go = needed ?? optional;
      if (go) {
        setActive(go);
        requestAnimationFrame(showGrid);
      }
    }
  }

  /** Takes one piece out of a slot, or the whole slot. */
  function removePiece(slot: Slot, p?: Product) {
    setLook((l) => {
      const left = p ? (l[slot] ?? []).filter((x) => x.id !== p.id) : [];
      return { ...l, [slot]: left.length ? left : undefined };
    });
  }

  const itemsBody = () => SLOTS.filter((s) => states[s] !== 'included').flatMap((s) => (look[s] ?? []).map((p) => ({ slot: s, productId: p.id })));

  /* ------------------------------ AI preview ------------------------------ */
  /** Whether the server has the AI preview switched on (a Google Cloud project is set). */
  const [previewOn, setPreviewOn] = useState(false);
  /** The private draft of the finished look, with its preview once it is made */
  const [draft, setDraft] = useState<Design | null>(null);
  const [previewing, setPreviewing] = useState(false);
  /** The look just published, to share and open */
  const [published, setPublished] = useState<Design | null>(null);
  /** The full-screen "Your look is live!" share step, right after publishing */
  const [liveOpen, setLiveOpen] = useState(false);
  /** The body size the model is shown at (remembered on this device) */
  const [size, setSize] = useState<BodySize>('medium');
  useEffect(() => {
    try {
      const saved = localStorage.getItem('saleeqa.previewSize') as BodySize | null;
      if (saved && BODY_SIZES.some((b) => b.id === saved)) setSize(saved);
    } catch { /* private window: medium */ }
  }, []);

  /** How many previews the player has left, and what (if anything) stops a new one: kept fresh after each. */
  const [pstatus, setPstatus] = useState<PreviewStatus | null>(null);
  /** Free previews every new account gets (shown to guests on the button) */
  const [freePreviews, setFreePreviews] = useState<number | null>(null);
  const loadPreview = () =>
    api<{ enabled: boolean; free?: number; status?: PreviewStatus }>('/game/preview')
      .then((r) => {
        setPreviewOn(r.enabled);
        setPstatus(r.status ?? null);
        setFreePreviews(r.free ?? null);
      })
      .catch(() => setPreviewOn(false));
  useEffect(() => {
    if (ready) loadPreview();
  }, [ready]);
  // The confirmation link is usually opened in another tab or on the phone: check again on return,
  // so the preview unlocks without a reload.
  useEffect(() => {
    if (!me || pstatus?.blocked !== 'verify') return;
    const again = () => document.visibilityState === 'visible' && loadPreview();
    document.addEventListener('visibilitychange', again);
    window.addEventListener(EMAIL_VERIFIED, loadPreview);
    return () => {
      document.removeEventListener('visibilitychange', again);
      window.removeEventListener(EMAIL_VERIFIED, loadPreview);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, pstatus?.blocked]);
  /** Guests see the button (it leads to sign-up); players only while they have a preview to use. */
  const canPreview = previewOn && (!me || !pstatus?.blocked);
  const [resending, setResending] = useState(false);
  /** Laptop testing only: the link the confirmation email carries */
  const [verifyLink, setVerifyLink] = useState<string | null>(null);
  async function resendVerification() {
    setResending(true);
    const r = await resendConfirmation();
    if (r?.devLink) setVerifyLink(r.devLink);
    setResending(false);
  }

  /**
   * A guest's look is finished: an account is needed to preview or publish it. The look is already
   * kept on this device (saved as it is built), and sign-up brings them straight back to it.
   */
  function join() {
    if (challenge) {
      try {
        localStorage.setItem(GUEST_KEY, JSON.stringify({ challengeId: challenge.id, look, active, at: Date.now() } satisfies SavedLook));
      } catch { /* storage blocked: they will pick the pieces again */ }
    }
    router.push(`/signup${BACK_TO_LOOK}`);
  }

  /** Saves the look as a private draft, then has the AI dress the model in it (about half a minute). */
  async function preview() {
    if (!challenge || missing.length || previewing) return;
    if (!me) return join();
    setError('');
    setStep('preview');
    setPreviewing(true);
    try {
      const saved = (await api<{ design: Design }>('/game/designs', { body: { challengeId: challenge.id, items: itemsBody(), draft: true } })).design;
      setDraft(saved);
      setDraft((await api<{ design: Design }>(`/game/designs/${saved.id}/preview`, { body: { size } })).design);
    } catch (e) {
      setError((e as Error).message);
    }
    setPreviewing(false);
    loadPreview();
  }

  /** The same look on the next of our models (a new image). */
  async function anotherModel() {
    if (!draft || previewing) return;
    setError('');
    setPreviewing(true);
    try {
      setDraft((await api<{ design: Design }>(`/game/designs/${draft.id}/preview`, { body: { anotherModel: true, size } })).design);
    } catch (e) {
      setError((e as Error).message);
    }
    setPreviewing(false);
    loadPreview();
  }

  /** Picks the body size; on the preview step, the same look is shown again at that size. */
  async function pickSize(next: BodySize) {
    if (next === size || previewing) return;
    setSize(next);
    try {
      localStorage.setItem('saleeqa.previewSize', next);
    } catch { /* not remembered */ }
    if (step !== 'preview' || !draft) return;
    setError('');
    setPreviewing(true);
    try {
      setDraft((await api<{ design: Design }>(`/game/designs/${draft.id}/preview`, { body: { size: next } })).design);
    } catch (e) {
      setError((e as Error).message);
    }
    setPreviewing(false);
    loadPreview();
  }

  /** Back to the builder; the pieces stay as they were. A changed look gets a new preview. */
  function changePieces() {
    setError('');
    setDraft(null);
    setStep('build');
  }

  /** Publishes the previewed draft, or (without a preview) the look straight away, to the Runway. */
  /** Publishing puts the look on the Runway for everyone, so a look without a preview asks first. */
  const [confirmPublish, setConfirmPublish] = useState(false);
  function askPublish() {
    if (!challenge || missing.length) return;
    if (!me) return join();
    if (draft?.previewUrl) return publish();
    setConfirmPublish(true);
  }

  async function publish() {
    setConfirmPublish(false);
    if (!challenge || missing.length) return;
    if (!me) return join();
    setError('');
    setBusy(true);
    try {
      const r = draft
        ? await api<{ design: Design }>(`/game/designs/${draft.id}/publish`, { method: 'POST' })
        : await api<{ design: Design }>('/game/designs', { body: { challengeId: challenge.id, items: itemsBody() } });
      setPublished(r.design);
      setStep('done');
      setLiveOpen(true);
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

  const lookOf = (d: Design) => lookFromItems(d.items);
  const doneStates = (d: Design): Partial<Record<Slot, SlotState>> => {
    const has = new Set(d.items.map((i) => i.slot));
    return Object.fromEntries(slotsFor(d.challenge?.gender).map((s) => [s, has.has(s) ? 'optional' : 'hidden'])) as Partial<Record<Slot, SlotState>>;
  };

  /** The phone bar shows while building or previewing a look. */
  const bar = tab === 'design' && (step === 'build' || step === 'preview');

  if (!ready || !me) return <Header signedIn={Boolean(me)} />;

  return (
    <>
      <Header signedIn={Boolean(me)} />
      <main className={`page py-6 sm:py-8 ${bar ? 'pb-28 md:pb-8' : ''}`}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Studio</p>
            <h1 className="mt-1 text-3xl font-semibold sm:text-4xl">Style the look</h1>
            <p className="mt-1 max-w-xl text-sm text-ink/70">
              Pick a challenge or describe your own, put a complete look together from Pakistan’s favourite brands.
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
                className={`min-h-[40px] rounded-full px-4 py-2 ${tab === t ? 'bg-plum text-white' : 'text-ink/70 hover:bg-sand'}`}
              >
                {t === 'design' ? 'Design' : 'My designs'}
              </button>
            ))}
          </div>
        </div>

        {/* The launch contest while choosing a challenge: Play opens the first launch challenge. */}
        {tab === 'design' && step === 'challenge' && (
          <LaunchBanner
            onPlay={(id) =>
              findChallenge(id).then((c) => {
                if (!c) return toast('That challenge is not open any more.', 'error');
                setSide(c.gender);
                chooseChallenge(c);
              })
            }
          />
        )}

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
                        {me && <button type="button" className="btn btn-ghost !min-h-[36px] !px-4 !py-1.5 text-sm" onClick={forgetSaved}>Start fresh</button>}
                      </div>
                    </div>
                  )}
                  <div className="mt-3">
                    <StudioBrief gender={gender} onGender={setSide} onStart={chooseChallenge} tags={(c) => <ChallengeTags c={c} />} />
                  </div>
                  <h3 className="mt-5 text-sm font-semibold">Or pick a challenge</h3>
                  {challenges && occasionsHere.length > 1 && (
                    <div className="no-scrollbar -mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Filter challenges by occasion">
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
                              <img src={photo(c.cover, 140)} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="h-[72px] w-14 shrink-0 rounded-xl bg-sand object-cover object-top" />
                            ) : (
                              <span className="h-[72px] w-14 shrink-0 rounded-xl bg-sand" aria-hidden="true" />
                            )}
                            <span className="block min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-sm font-semibold">{c.title}</span>
                              {c.featured ? (
                                <span className="shrink-0 rounded-full bg-gold px-2 py-0.5 text-[11px] font-semibold text-ink">{c.prize ? '★ Launch' : '★ This week'}</span>
                              ) : (
                                c.fromShoppers && <span className="shrink-0 rounded-full bg-plum-soft px-2 py-0.5 text-[11px] font-semibold text-plum-dark">asked by shoppers</span>
                              )}
                            </div>
                            {c.prize && <PrizeLine text={c.prize} />}
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
                  {challenge.custom && <p className="eyebrow mt-2">Your own brief</p>}
                  <h2 className="mt-1 font-semibold">{challenge.title}</h2>
                  {challenge.prize && <PrizeLine text={challenge.prize} />}
                  <ChallengeTags c={challenge} />
                </div>
              )}

              {step === 'loading' && <p className="text-sm text-ink/65">Opening the wardrobe…</p>}

              {step === 'build' && (
                <>
                  <h2 className="font-semibold">2 · Build your look</h2>
                  <ul className="mt-3 space-y-1.5">
                    {SLOTS.map((s) => {
                      const p = look[s]?.[0];
                      const n = countIn(look, s);
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
                              <img src={photo(p.images[0], 96)} alt="" decoding="async" referrerPolicy="no-referrer" className="h-9 w-9 shrink-0 rounded-lg object-cover object-top" style={{ background: p.hex }} />
                            ) : (
                              <span className="h-9 w-9 shrink-0 rounded-lg border border-ink/10" style={{ background: p?.hex ?? 'transparent', borderStyle: p ? 'solid' : 'dashed' }} />
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="block font-medium">{SLOT_NAME[s]}</span>
                              <span className="block truncate text-xs text-ink/65">
                                {st === 'included'
                                  ? 'Comes with your outfit'
                                  : n > 1
                                    ? `${n} pieces · ${rupees((look[s] ?? []).reduce((m, x) => m + x.price, 0))}`
                                    : p
                                      ? `${p.brandName} · ${rupees(p.price)}`
                                      : st === 'required'
                                        ? 'Needed'
                                        : maxPieces(s) > 1
                                          ? `Optional · up to ${maxPieces(s)}`
                                          : 'Optional'}
                              </span>
                            </span>
                            {st === 'required' && !p && <span className="h-2 w-2 rounded-full bg-plum" aria-label="needed" />}
                          </button>
                          {p && st !== 'included' && (
                            <button
                              type="button"
                              onClick={() => removePiece(s)}
                              aria-label={n > 1 ? `Remove all ${SLOT_NAME[s].toLowerCase()}` : `Remove ${SLOT_NAME[s].toLowerCase()}`}
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
                  {/* Most briefs have no budget (the total is kept to match looks to shoppers' budgets later); launch briefs can. */}
                  <div className="mt-4 flex justify-between text-sm">
                    <span>Look total</span>
                    <span className={`font-semibold ${challenge?.lookBudget && total > challenge.lookBudget ? 'text-red-700' : ''}`}>{rupees(total)}</span>
                  </div>
                  {challenge?.lookBudget ? (
                    <p className={`mt-1 text-right text-xs ${total > challenge.lookBudget ? 'font-semibold text-red-700' : 'text-ink/70'}`} role="status">
                      {total > challenge.lookBudget
                        ? `${rupees(total - challenge.lookBudget)} over the ${rupees(challenge.lookBudget)} budget: swap a piece for a cheaper one`
                        : `Budget ${rupees(challenge.lookBudget)} · ${rupees(challenge.lookBudget - total)} left`}
                    </p>
                  ) : null}
                  {!me && missing.length === 0 && (
                    <p className="mt-4 rounded-xl bg-ivory px-3 py-2 text-xs text-ink/75">
                      Your look is ready! A free account lets you see it on a model and publish it. Your pieces stay chosen.{' '}
                      <a className="font-semibold text-plum underline-offset-2 hover:underline" href={`/login${BACK_TO_LOOK}`}>I have an account</a>
                    </p>
                  )}
                  {missing.length > 0 ? (
                    <button className="btn btn-primary mt-5 w-full" disabled>
                      Add {missing.map((s) => SLOT_NAME[s].toLowerCase()).join(', ')}
                    </button>
                  ) : canPreview ? (
                    <>
                      <SizePicker size={size} onPick={pickSize} disabled={previewing} />
                      <button className="btn btn-primary mt-4 w-full" onClick={preview}>✨ {previewLabel(pstatus, freePreviews)}</button>
                      <p className="mt-2 text-center text-xs text-ink/70">See your look on a model before it goes on the Runway.</p>
                      <button className="btn btn-ghost mt-3 w-full" disabled={busy} onClick={askPublish}>
                        {busy ? 'Publishing…' : 'Publish my look'}
                      </button>
                    </>
                  ) : (
                    <>
                      {/* The preview stays in sight while it is locked, with the reason right under it. */}
                      {me && previewOn && pstatus?.blocked && (
                        <button className="btn btn-ghost mt-4 w-full" disabled aria-describedby="preview-locked">🔒 See it on a model</button>
                      )}
                      {me && previewOn && pstatus?.blocked && (
                        <div id="preview-locked" className="mt-2 rounded-xl bg-ivory px-3 py-2.5 text-xs text-ink/80" role="status">
                          {pstatus.blocked === 'verify' ? (
                            <>
                              <p>
                                <strong>
                                  Confirm your email to unlock {pstatus.left > 0 ? `your ${pstatus.left} free AI preview${pstatus.left === 1 ? '' : 's'}` : 'AI previews'}.
                                </strong>{' '}
                                We sent a link to <span className="break-all">{me.user.email}</span>.
                              </p>
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <button type="button" className="btn btn-primary !min-h-[40px] !px-4 !py-1.5 text-sm" disabled={resending} onClick={resendVerification}>
                                  {resending ? 'Sending…' : 'Resend email'}
                                </button>
                                {verifyLink && (
                                  <a href={verifyLink} className="inline-flex min-h-[40px] items-center px-2 text-sm font-semibold text-plum-dark underline underline-offset-2">
                                    Open link (testing)
                                  </a>
                                )}
                              </div>
                            </>
                          ) : (
                            <p>{pstatus.message}</p>
                          )}
                        </div>
                      )}
                      {/* Publishing never waits for a preview: always there, always the main button here. */}
                      <button className="btn btn-primary mt-3 w-full" disabled={busy} onClick={askPublish}>
                        {busy ? 'Publishing…' : 'Publish my look'}
                      </button>
                    </>
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
                  <SizePicker size={size} onPick={pickSize} disabled={previewing || busy} />
                  <div className="mt-4 flex justify-between text-sm">
                    <span>Look total</span>
                    <span className="font-semibold">{rupees(total)}</span>
                  </div>
                  <div className="mt-5 flex flex-col gap-2">
                    {!previewing && !draft?.previewUrl && (
                      <button className="btn btn-ghost w-full" onClick={preview}>Try the preview again</button>
                    )}
                    <button className="btn btn-primary w-full" disabled={busy || previewing} onClick={askPublish}>
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
                        <ShareButtons lookId={published.id} compact text={shareMessage('en', challenge?.name ?? challenge?.title, published.total)} />
                      </div>
                      {pstatus?.canEarn !== false && (
                        <p className="mt-2 text-xs text-ink/75">
                          Each friend who joins and publishes a look gives you +1 free preview (up to 5). So do {pstatus?.likesForCredit ?? 3} likes on this look.
                        </p>
                      )}
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
                            {countIn(look, s) ? '✓ ' : states[s] === 'required' ? '• ' : ''}
                            {SLOT_NAME[s]}
                            {countIn(look, s) > 1 ? ` (${countIn(look, s)})` : ''}
                          </button>
                        ))}
                      </div>
                      <div ref={gridRef} className="scroll-mt-28">
                        <h3 className="mb-2 font-semibold">
                          {SLOT_NAME[active]}
                          {maxPieces(active) > 1 && (
                            <span className="ml-2 text-sm font-normal text-ink/70">
                              Pick up to {maxPieces(active)} · {countIn(look, active)} chosen
                            </span>
                          )}
                        </h3>
                        {states[active] === 'included' ? (
                          <p className="text-sm text-ink/70">Your outfit already comes with this.</p>
                        ) : (
                          challenge && (
                            <PieceGrid
                              key={`${challenge.id}-${active}`}
                              challengeId={challenge.id}
                              slot={active}
                              selected={look[active] ?? []}
                              swaps={maxPieces(active) === 1}
                              onPick={(p) => put(active, p)}
                              onRemove={(p) => removePiece(active, p)}
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

        {step === 'done' && published && liveOpen && (
          <LookLive
            lookId={published.id}
            challengeTitle={challenge?.name ?? challenge?.title}
            total={published.total}
            imageUrl={published.previewUrl ?? draft?.previewUrl}
            fallback={<LookBoard pieces={look} states={states} gender={challenge?.gender} className="w-full" />}
            canEarn={pstatus?.canEarn !== false}
            onClose={() => setLiveOpen(false)}
          />
        )}

        {confirmPublish && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center" onClick={() => setConfirmPublish(false)}>
            <div role="dialog" aria-modal="true" aria-labelledby="publish-title" className="card w-full max-w-md text-center" onClick={(e) => e.stopPropagation()}>
              <h2 id="publish-title" className="text-xl font-semibold">Publish without a preview?</h2>
              <p className="mt-2 text-sm text-ink/75">
                Your look goes on the Runway straight away, where everyone can see it.
                {previewOn && pstatus?.blocked === 'verify' && ' To see it on a model first, confirm your email: it unlocks your free previews.'}
                {previewOn && !pstatus?.blocked && ' You can still see it on a model first.'}
              </p>
              <div className="mt-5 flex flex-col gap-2">
                <button type="button" className="btn btn-primary" disabled={busy} onClick={publish}>Yes, publish to the Runway</button>
                <button type="button" className="btn btn-ghost" onClick={() => setConfirmPublish(false)}>Not yet</button>
              </div>
            </div>
          </div>
        )}

        {tab === 'mine' && (
          <div className="mt-6">
            {!me ? (
              <div className="card py-10 text-center">
                <h2 className="font-semibold">Your published looks live here</h2>
                <p className="mt-1 text-sm text-ink/70">Create a free account to publish looks and see them on the Runway.</p>
                <div className="mt-4 flex justify-center gap-2">
                  <Link className="btn btn-primary" href={`/signup${BACK_TO_LOOK}`}>Sign up free</Link>
                  <Link className="btn btn-ghost" href={`/login${BACK_TO_LOOK}`}>Sign in</Link>
                </div>
              </div>
            ) : !mine ? (
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
              ) : canPreview ? (
                <button className="btn btn-primary !min-h-[44px] shrink-0" onClick={preview}>✨ Preview</button>
              ) : (
                <button className="btn btn-primary !min-h-[44px] shrink-0" disabled={busy} onClick={askPublish}>{busy ? 'Publishing…' : 'Publish'}</button>
              )
            ) : (
              <button className="btn btn-primary !min-h-[44px] shrink-0" disabled={busy || previewing} onClick={askPublish}>
                {busy ? 'Publishing…' : previewing ? 'Dressing…' : 'Publish'}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

type BodySize = 'small' | 'medium' | 'large' | 'plus';
const BODY_SIZES: Array<{ id: BodySize; label: string }> = [
  { id: 'small', label: 'Small' },
  { id: 'medium', label: 'Medium' },
  { id: 'large', label: 'Large' },
  { id: 'plus', label: 'Plus size' },
];

/** Which body size the model wears the look at. */
function SizePicker({ size, onPick, disabled }: { size: BodySize; onPick: (s: BodySize) => void; disabled?: boolean }) {
  return (
    <fieldset className="mt-5">
      <legend className="text-sm font-semibold">Model size</legend>
      <div className="mt-2 grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Model size">
        {BODY_SIZES.map((b) => (
          <button
            key={b.id}
            type="button"
            role="radio"
            aria-checked={size === b.id}
            disabled={disabled}
            onClick={() => onPick(b.id)}
            className={`chip justify-center !px-1 text-xs disabled:opacity-60 ${size === b.id ? 'chip-on' : ''}`}
          >
            {b.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
