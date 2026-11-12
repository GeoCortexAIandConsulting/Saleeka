'use client';
import { useEffect, useState } from 'react';

/**
 * Small pop-up messages ("toasts") at the bottom of the screen, so a message is seen wherever the
 * player has scrolled (an error box at the top of a page is out of sight on a phone).
 * Call `toast('Saved')` or `toast(message, 'error')` from anywhere; <Toaster /> sits in the layout.
 */
type Kind = 'info' | 'error' | 'success';
type Toast = { id: number; text: string; kind: Kind };

const EVENT = 'saleeqa:toast';
let next = 0;

export function toast(text: string, kind: Kind = 'info') {
  if (typeof window === 'undefined' || !text) return;
  window.dispatchEvent(new CustomEvent<Toast>(EVENT, { detail: { id: ++next, text, kind } }));
}

export default function Toaster() {
  const [list, setList] = useState<Toast[]>([]);

  useEffect(() => {
    const add = (e: Event) => {
      const t = (e as CustomEvent<Toast>).detail;
      // The same message twice in a row is shown once.
      setList((l) => (l.some((x) => x.text === t.text) ? l : [...l.slice(-2), t]));
      setTimeout(() => setList((l) => l.filter((x) => x.id !== t.id)), t.kind === 'error' ? 6000 : 3500);
    };
    window.addEventListener(EVENT, add);
    return () => window.removeEventListener(EVENT, add);
  }, []);

  return (
    // Above the Studio's phone bar; read out by screen readers as it appears.
    <div className="pointer-events-none fixed inset-x-0 bottom-[150px] z-50 flex flex-col items-center gap-2 px-4 sm:bottom-24 md:bottom-6" aria-live="polite" role="status">
      {list.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex max-w-md items-start gap-3 rounded-2xl px-4 py-3 text-sm shadow-lg animate-[toast-in_.18s_ease-out] ${
            t.kind === 'error' ? 'bg-red-700 text-white' : t.kind === 'success' ? 'bg-plum text-white' : 'bg-ink text-white'
          }`}
        >
          <span aria-hidden="true">{t.kind === 'error' ? '⚠' : t.kind === 'success' ? '✓' : 'ℹ'}</span>
          <span className="flex-1">{t.text}</span>
          <button type="button" onClick={() => setList((l) => l.filter((x) => x.id !== t.id))} aria-label="Dismiss" className="-mr-1 text-white/80 hover:text-white">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
