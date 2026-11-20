'use client';
import Link from 'next/link';
import { useState } from 'react';
import DevLink from '@/components/DevLink';
import Header from '@/components/Header';
import AuthShell from '@/components/AuthShell';
import { api } from '@/lib/api';

/** "Forgot password": asks for the email and sends a reset link (the same answer whether or not it has an account). */
export default function Forgot() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = await api<{ devLink?: string }>('/auth/forgot', { body: { email } });
      setDevLink(r.devLink ?? null);
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  }

  return (
    <>
      <Header signedIn={false} />
      <AuthShell>
        <h1 className="text-3xl font-bold">Forgot your password?</h1>
        {sent ? (
          <div className="mt-6 space-y-4" role="status">
            <p className="text-ink/80">
              If <strong>{email}</strong> has a Saleeqa account, a link to choose a new password is on its way. It works for one hour.
            </p>
            <p className="text-sm text-ink/70">Nothing after a few minutes? Check your spam folder, or try again.</p>
            <DevLink href={devLink} label="Open the reset link" />
            <button type="button" className="btn btn-ghost w-full" onClick={() => setSent(false)}>Try again</button>
          </div>
        ) : (
          <>
            <p className="mt-1 text-ink/70">Enter your email and we will send you a link to choose a new one.</p>
            <form onSubmit={submit} className="mt-6 space-y-4">
              <label className="block text-sm font-medium">
                Email
                <input className="input mt-1" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
              <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Sending…' : 'Send me a link'}</button>
            </form>
          </>
        )}
        <p className="mt-6 text-center text-sm">
          Remembered it? <Link className="font-semibold text-plum" href="/login">Sign in</Link>
        </p>
      </AuthShell>
    </>
  );
}
