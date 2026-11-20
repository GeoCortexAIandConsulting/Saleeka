'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export type UsernameState = 'empty' | 'checking' | 'ok' | 'bad';

/**
 * A username box that checks, as the player types, that the name is allowed and nobody else has it.
 * `onState` reports whether the form may be sent.
 */
export default function UsernameField({ value, onChange, onState, current }: { value: string; onChange: (v: string) => void; onState?: (s: UsernameState) => void; current?: string | null }) {
  const [state, setState] = useState<UsernameState>('empty');
  const [reason, setReason] = useState('');

  useEffect(() => {
    const name = value.trim().replace(/^@/, '').toLowerCase();
    if (!name) return report('empty', '');
    if (current && name === current) return report('ok', '');
    report('checking', '');
    // Ask once typing pauses, not on every key.
    const t = setTimeout(() => {
      api<{ available: boolean; reason?: string }>(`/auth/username?name=${encodeURIComponent(name)}`)
        .then((r) => report(r.available ? 'ok' : 'bad', r.reason ?? ''))
        .catch(() => report('ok', '')); // could not check: the server checks again on save
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, current]);

  function report(s: UsernameState, why: string) {
    setState(s);
    setReason(why);
    onState?.(s);
  }

  return (
    <label className="block text-sm font-medium">
      Username
      <div className="relative mt-1">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/65" aria-hidden="true">@</span>
        <input
          className="input !pl-8"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          maxLength={21}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\s/g, ''))}
          aria-describedby="username-help"
          aria-invalid={state === 'bad'}
        />
      </div>
      <span id="username-help" className="mt-1 block text-xs font-normal" aria-live="polite">
        {state === 'checking' && <span className="text-ink/65">Checking…</span>}
        {state === 'ok' && value.trim() && <span className="font-semibold text-emerald-700">✓ {current && value.trim().toLowerCase() === current ? 'Your username' : 'Available'}</span>}
        {state === 'bad' && <span className="font-semibold text-red-700">{reason}</span>}
        {state === 'empty' && <span className="text-ink/65">3–20 letters, numbers, dots or underscores. Shown on the Runway.</span>}
      </span>
    </label>
  );
}
