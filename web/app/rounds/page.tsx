'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import Header from '@/components/Header';
import LookCard from '@/components/LookCard';
import { api, ApiError } from '@/lib/api';
import { useRequireUser } from '@/lib/useMe';
import type { Look } from '@/lib/types';

const TAG_LABEL: Record<string, string> = {
  love_color: 'Love the colour',
  love_style: 'Love the style',
  too_heavy: 'Too heavy',
  too_plain: 'Too plain',
  too_bold: 'Too bold',
  not_my_brand: 'Not my brand',
  too_revealing: 'Too revealing',
  wrong_occasion: 'Wrong occasion',
};

interface RoundData {
  round: { id: string; index: number; max: number };
  looks: Look[];
  quickTags: string[];
}

export default function Rounds() {
  const me = useRequireUser({ needProfile: true });
  const [data, setData] = useState<RoundData | null>(null);
  const [ranks, setRanks] = useState<string[]>([]);
  const [tags, setTags] = useState<Record<string, string[]>>({});
  const [note, setNote] = useState('');
  const [result, setResult] = useState<{ learned: string[]; summary: string; roundsLeft: number } | null>(null);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError('');
    setResult(null);
    setRanks([]);
    setTags({});
    setNote('');
    try {
      setData(await api<RoundData>('/rounds', { body: {} }));
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setFinished(true);
      else setError((e as Error).message);
    }
  }, []);

  // The rounds show women's looks; a man who opens this page goes to the Studio instead.
  const router = useRouter();
  const isMan = me?.gender === 'male';
  useEffect(() => {
    if (isMan) router.replace('/studio');
    else if (me) load();
  }, [me, isMan, load, router]);

  const toggleRank = (id: string) =>
    setRanks((r) => (r.includes(id) ? r.filter((x) => x !== id) : r.length < 3 ? [...r, id] : r));
  const toggleTag = (lookId: string, tag: string) =>
    setTags((t) => {
      const cur = t[lookId] ?? [];
      return { ...t, [lookId]: cur.includes(tag) ? cur.filter((x) => x !== tag) : [...cur, tag] };
    });

  async function submit() {
    if (!data) return;
    setBusy(true);
    setError('');
    const cleanTags = Object.fromEntries(Object.entries(tags).filter(([, v]) => v.length));
    try {
      const out = await api<{ learned: string[]; summary: string; roundsLeft: number }>(`/rounds/${data.round.id}/submit`, {
        body: { ranks, tags: cleanTags, note: note.trim() || undefined },
      });
      setResult(out);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  if (!me || isMan) return (<><Header /><main className="p-8 text-center text-ink/65">Loading…</main></>);

  if (finished || (result && result.roundsLeft === 0)) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-xl px-4 py-10 text-center">
          <h1 className="text-3xl font-bold">Your taste profile is ready</h1>
          {result && <p className="mx-auto mt-3 rounded-2xl bg-plum-soft p-4 text-left text-sm text-plum-dark">{result.summary}</p>}
          <Link href="/studio" className="btn btn-primary mt-6">Style a look in the Studio</Link>
        </main>
      </>
    );
  }

  if (result) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-xl px-4 py-10">
          <h1 className="text-2xl font-bold">Thanks, that helps a lot</h1>
          {result.learned.length > 0 && (
            <div className="card mt-4">
              <div className="mb-2 text-sm font-semibold">What we learned</div>
              <ul className="list-disc space-y-1 pl-5 text-sm">{result.learned.map((l) => <li key={l}>{l}</li>)}</ul>
            </div>
          )}
          <p className="mt-4 rounded-2xl bg-plum-soft p-4 text-sm text-plum-dark">{result.summary}</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button className="btn btn-primary" onClick={load}>Next round ({result.roundsLeft} left)</button>
            <Link href="/studio" className="btn btn-ghost">Skip to the Studio</Link>
          </div>
        </main>
      </>
    );
  }

  if (!data) return (<><Header /><main className="p-8 text-center text-ink/65">{error || 'Preparing your looks…'}</main></>);

  const complete = ranks.length === data.looks.length;
  const top = ranks[0];
  const bottom = ranks[ranks.length - 1];
  const reasonLooks = complete ? [...new Set([top, bottom])] : [];

  return (
    <>
      <Header />
      <main className="page pb-28 pt-6 lg:pt-10">
        <div className="text-xs font-semibold uppercase tracking-wide text-gold">Round {data.round.index} of {data.round.max}</div>
        <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Tap the looks in order, favourite first</h1>
        <p className="text-sm text-ink/65">Tap again to undo. There are no wrong answers.</p>

        <div className="mt-5 grid gap-4 landscape:grid-cols-3 md:grid-cols-3 lg:gap-6">
          {data.looks.map((l) => (
            <LookCard key={l.id} look={l} compact showReason={false} onSelect={() => toggleRank(l.id)} selected={ranks.includes(l.id)} rank={ranks.indexOf(l.id) + 1 || null} />
          ))}
        </div>

        {complete && (
          <section className="mt-8 space-y-6">
            <h2 className="text-xl font-bold">Tell us why (optional, but it helps most)</h2>
            {reasonLooks.map((id, idx) => {
              const look = data.looks.find((l) => l.id === id)!;
              return (
                <div key={id} className="card">
                  <div className="mb-2 text-sm font-semibold">{idx === 0 ? 'Your favourite' : 'Your least favourite'}: {look.label}</div>
                  <div className="flex flex-wrap gap-2">
                    {data.quickTags.map((t) => {
                      const on = (tags[id] ?? []).includes(t);
                      return (
                        <button key={t} className={`chip ${on ? 'chip-on' : ''}`} aria-pressed={on} onClick={() => toggleTag(id, t)}>{TAG_LABEL[t] ?? t}</button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <label className="block text-sm font-medium">
              Anything else? Colours you love or hate, fit, fabric…
              <textarea className="input mt-1 min-h-[96px]" maxLength={600} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: I love emerald, but the red one felt too revealing." />
            </label>
          </section>
        )}
        {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      </main>

      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-ivory/95 backdrop-blur">
        <div className="page flex items-center gap-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex-1 text-sm text-ink/65">{complete ? 'Ready to submit' : `${ranks.length} of ${data.looks.length} ranked`}</div>
          <button className="btn btn-primary" disabled={!complete || busy} onClick={submit}>{busy ? 'Saving…' : 'Submit ranking'}</button>
        </div>
      </div>
    </>
  );
}
