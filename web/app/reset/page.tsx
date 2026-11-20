'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import AuthShell from '@/components/AuthShell';
import { api } from '@/lib/api';

/** Opened from the reset email (?token=…): choose a new password, then go straight to the Studio. */
export default function Reset() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get('token') ?? '');
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== again) return setError('The two passwords are not the same.');
    setError('');
    setBusy(true);
    try {
      await api('/auth/reset', { body: { token, password } });
      router.replace('/studio');
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <Header signedIn={false} />
      <AuthShell>
        <h1 className="text-3xl font-bold">Choose a new password</h1>
        {token === '' ? (
          <p className="mt-4 text-ink/80">
            This page needs the link from your email. <Link className="font-semibold text-plum" href="/forgot">Ask for a new link</Link>
          </p>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="block text-sm font-medium">
              New password
              <input className="input mt-1" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <label className="block text-sm font-medium">
              The same password again
              <input className="input mt-1" type="password" autoComplete="new-password" minLength={8} required value={again} onChange={(e) => setAgain(e.target.value)} />
            </label>
            <p className="text-xs text-ink/65">At least 8 characters.</p>
            {error && (
              <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
                {error}
                {/expired|used/.test(error) && (
                  <>
                    {' '}
                    <Link className="font-semibold underline" href="/forgot">Send a new link</Link>
                  </>
                )}
              </p>
            )}
            <button className="btn btn-primary w-full" disabled={busy || token === null}>{busy ? 'Saving…' : 'Save and sign in'}</button>
          </form>
        )}
      </AuthShell>
    </>
  );
}
