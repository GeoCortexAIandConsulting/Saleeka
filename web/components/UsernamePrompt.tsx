'use client';
import { useEffect, useState } from 'react';
import UsernameField, { type UsernameState } from '@/components/UsernameField';
import { toast } from '@/components/Toaster';
import { api } from '@/lib/api';
import type { Me } from '@/lib/types';

/** Accounts made before usernames existed pick one, once, the next time they visit. */
export default function UsernamePrompt() {
  const [show, setShow] = useState(false);
  const [name, setName] = useState('');
  const [state, setState] = useState<UsernameState>('empty');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Me>('/me')
      .then((m) => setShow(!m.user.username))
      .catch(() => {});
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/me', { method: 'PATCH', body: { username: name.trim().replace(/^@/, '') } });
      setShow(false);
      toast('Username saved. It’s how you’ll appear on the Runway.', 'success');
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  }

  if (!show) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
      <form onSubmit={save} role="dialog" aria-modal="true" aria-labelledby="pick-username" className="card w-full max-w-md">
        <p className="eyebrow">One quick thing</p>
        <h2 id="pick-username" className="mt-1 text-xl font-semibold">Pick your username</h2>
        <p className="mt-1 text-sm text-ink/75">It’s how other players see you on the Runway, instead of your name.</p>
        <div className="mt-4">
          <UsernameField value={name} onChange={setName} onState={setState} />
        </div>
        {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <button className="btn btn-primary mt-5 w-full" disabled={busy || state !== 'ok'}>{busy ? 'Saving…' : 'Save username'}</button>
      </form>
    </div>
  );
}
