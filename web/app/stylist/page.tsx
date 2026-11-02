'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import Header from '@/components/Header';
import LookCard from '@/components/LookCard';
import { api } from '@/lib/api';
import { useRequireUser } from '@/lib/useMe';
import type { Look, Slot } from '@/lib/types';

interface Msg {
  role: 'user' | 'assistant';
  text: string;
  looks?: Look[];
  notes?: string[];
  suggestions?: string[];
}

const STARTERS = [
  'Mehndi outfit, green, under 25k',
  'Office look, soft colours, under 15k',
  'Eid outfit, full sleeves, any brand',
  'Walima, pastel, from Demo Studio',
];

export default function Stylist() {
  const me = useRequireUser({ needProfile: true });
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [swapping, setSwapping] = useState<string | null>(null);
  const [error, setError] = useState('');
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [msgs, busy]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setInput('');
    setError('');
    setMsgs((m) => [...m, { role: 'user', text: message }]);
    setBusy(true);
    try {
      const res = await api<{ sessionId: string; reply: string; looks: Look[]; notes: string[]; suggestions?: string[] }>('/chat', {
        body: { message, sessionId },
      });
      setSessionId(res.sessionId);
      setMsgs((m) => [...m, { role: 'assistant', text: res.reply, looks: res.looks, notes: res.notes, suggestions: res.suggestions }]);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  const patchLook = (id: string, fn: (l: Look) => Look) =>
    setMsgs((ms) => ms.map((m) => (m.looks ? { ...m, looks: m.looks.map((l) => (l.id === id ? fn(l) : l)) } : m)));

  async function save(look: Look) {
    const saved = !look.saved;
    try {
      await api(`/looks/${look.id}/save`, { body: { saved } });
      patchLook(look.id, (l) => ({ ...l, saved }));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function swap(look: Look, slot: Slot) {
    setSwapping(`${look.id}:${slot}`);
    setError('');
    try {
      const res = await api<{ look: Look }>(`/looks/${look.id}/swap`, { body: { slot } });
      patchLook(look.id, (l) => ({ ...res.look, saved: l.saved }));
    } catch (e) {
      setError((e as Error).message);
    }
    setSwapping(null);
  }

  if (!me) return (<><Header /><main className="p-8 text-center text-ink/60">Loading…</main></>);

  return (
    <>
      <Header />
      <main className="page pb-40 pt-6 lg:pt-10">
        {msgs.length === 0 && (
          <section className="py-6 text-center">
            <h1 className="text-3xl font-bold">Hi {me.user.name.split(' ')[0]}, what are we styling?</h1>
            <p className="mt-2 text-ink/70">Tell me the occasion, colours, brands or budget, in English or Roman Urdu.</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {STARTERS.map((s) => (
                <button key={s} className="chip hover:bg-sand" onClick={() => send(s)}>{s}</button>
              ))}
            </div>
            {me.roundsDone < 2 && (
              <p className="mt-6 text-sm text-ink/60">
                Your looks get sharper with every ranking round. <Link className="font-semibold text-plum" href="/rounds">Do a round</Link>
              </p>
            )}
          </section>
        )}

        <div className="space-y-5">
          {msgs.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'flex justify-end' : ''}>
              <div className={m.role === 'user' ? 'max-w-[85%] rounded-2xl rounded-br-sm bg-plum px-4 py-3 text-white' : 'w-full'}>
                <p className={m.role === 'assistant' ? 'text-ink' : ''}>{m.text}</p>
                {m.notes?.map((n) => <p key={n} className="mt-1 text-xs italic text-ink/60">{n}</p>)}
                {m.suggestions && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {m.suggestions.map((s) => (
                      <button key={s} className="chip capitalize hover:bg-sand" onClick={() => send(s)}>{s}</button>
                    ))}
                  </div>
                )}
                {m.looks && m.looks.length > 0 && (
                  <div className="mt-4 grid gap-4 landscape:grid-cols-3 md:grid-cols-3 lg:gap-6">
                    {m.looks.map((l) => (
                      <LookCard
                        key={l.id}
                        look={l}
                        onSave={() => save(l)}
                        onSwap={(slot) => swap(l, slot)}
                        swapping={swapping?.startsWith(l.id) ? (swapping.split(':')[1] as Slot) : null}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {busy && <p className="text-sm text-ink/50">Styling…</p>}
          {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <div ref={bottom} />
        </div>
      </main>

      <form
        className="fixed inset-x-0 bottom-0 border-t border-line bg-ivory/95 backdrop-blur"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <div className="page flex gap-2 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <input
            className="input"
            placeholder="e.g. baraat outfit, maroon or gold, under 40k"
            maxLength={500}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            aria-label="Message your stylist"
          />
          <button className="btn btn-primary" disabled={busy || !input.trim()}>Send</button>
        </div>
      </form>
    </>
  );
}
