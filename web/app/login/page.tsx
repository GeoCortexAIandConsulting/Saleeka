'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import DevLink from '@/components/DevLink';
import Header from '@/components/Header';
import AuthShell from '@/components/AuthShell';
import { toast } from '@/components/Toaster';
import { api, ApiError, nextPath } from '@/lib/api';
import type { Me } from '@/lib/types';

export default function Login() {
  const router = useRouter();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  // Keep ?next= when switching between sign-up and sign-in (a guest's look waits in the Studio).
  const [qs, setQs] = useState('');
  useEffect(() => setQs(window.location.search), []);

  const [busy, setBusy] = useState(false);
  /** The account exists but its email was never confirmed: offer a new link */
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [resent, setResent] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setUnconfirmed(false);
    setBusy(true);
    try {
      await api('/auth/login', { body: form });
      const me = await api<Me>('/me');
      router.replace(nextPath(me.hasProfile ? '/studio' : '/quiz'));
    } catch (err: any) {
      setError(err.message);
      setUnconfirmed(err instanceof ApiError && err.status === 403);
      setBusy(false);
    }
  }

  async function resend() {
    try {
      const r = await api<{ devLink?: string }>('/auth/verify/resend', { body: { email: form.email } });
      setDevLink(r.devLink ?? null);
      setResent(true);
      toast('We sent a new link. Check your inbox (and spam).', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  return (
    <>
      <Header signedIn={false} />
      <AuthShell>
        <h1 className="text-3xl font-bold">Welcome back</h1>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm font-medium">
            Email
            <input className="input mt-1" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label className="block text-sm font-medium">
            Password
            <input className="input mt-1" type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </label>
          <p className="-mt-2 text-right text-sm">
            <Link className="text-plum underline-offset-2 hover:underline" href="/forgot">Forgot password?</Link>
          </p>
          {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {unconfirmed && (
            <button type="button" className="btn btn-ghost w-full" disabled={resent} onClick={resend}>
              {resent ? 'Link sent: check your inbox' : 'Send the link again'}
            </button>
          )}
          <DevLink href={devLink} label="Open the confirmation link" />
          <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
        <p className="mt-6 text-center text-sm">New here? <Link className="font-semibold text-plum" href={`/signup${qs}`}>Create an account</Link></p>
      </AuthShell>
    </>
  );
}
